# MiCorreo — diagnóstico en capas (integrador vs cuenta portal)

MiCorreo en GND usa **dos credenciales distintas**. Un fallo en una no implica fallo en la otra. El panel admin y los endpoints de health exponen cada capa por separado para evitar falsos “todo OK”.

## Las dos capas

| Capa | Dónde se configura | Qué valida | Variables / BD |
|------|-------------------|------------|----------------|
| **API integrador** | `.env` del servidor (Vercel, etc.) | `POST /token` con Basic Auth del usuario API que entrega Correo Argentino | `CORREO_USERNAME_QA` / `CORREO_PASSWORD_QA` o `CORREO_USERNAME_PROD` / `CORREO_PASSWORD_PROD` según `INTEGRATIONS_ENV` |
| **Cuenta portal** | Admin → Configuración → Envíos | `POST /users/validate` con email + contraseña de la cuenta comercial MiCorreo | `empresa_envio_config`: `correo_account_email`, password cifrada, `correo_customer_id`, `correo_account_status` |

**Regla operativa:** “Cuenta vinculada” en Envíos solo confirma la capa portal. El checkout y la cotización también necesitan token integrador válido en el entorno de deploy.

## Síntoma típico en producción

- Admin → Envíos: **Vinculada** (`correo_account_status = active`, suffix `…1751`).
- Admin → Integraciones: **Error** en “API integrador (servidor)”.
- Checkout `POST /api/checkout/shipping/quote` → **503** con `code: MICORREO_INTEGRATOR_UNAUTHORIZED`.

Causa habitual: credenciales QA válidas en `apitest` pero **rechazadas** en `api` de producción (usuario integrador distinto o no habilitado para prod). Verificar con Postman:

```http
POST https://api.correoargentino.com.ar/micorreo/v1/token
Authorization: Basic <CORREO_USERNAME_PROD:CORREO_PASSWORD_PROD en base64>
Content-Type: application/json

{}
```

## Endpoints de diagnóstico

### `GET /api/admin/integrations/status`

Resumen de las tres integraciones. Para **correo** incluye capas, flags y estado agregado.

Implementación: [`integrations.controller.ts`](../src/controllers/integrations.controller.ts).

**Campos extra en `integrations.correo`:**

| Campo | Significado |
|-------|-------------|
| `layers.integrator` | Resultado de `POST /token` |
| `layers.account` | Estado de cuenta en BD + suffix de `customerId` |
| `layers.operational` | `validateCredentials` completo (token + validate); `skipped` si capas previas fallan |
| `healthy` | `integrator.ok` **y** `account.ok` |
| `readyForCheckout` | `healthy` **y** `operational.ok` |

**Estado agregado `correo.status`:** prioriza el peor problema — integrador en error → `error` aunque la cuenta esté `active`.

Ejemplo (integrador fallido, cuenta OK):

```json
{
  "integrations": {
    "correo": {
      "configured": true,
      "status": "error",
      "mode": "prod",
      "detail": "MiCorreo producción rechazó las credenciales API del servidor (POST /token 401)...",
      "healthy": false,
      "readyForCheckout": false,
      "layers": {
        "integrator": {
          "status": "error",
          "detail": "MiCorreo producción rechazó las credenciales API del servidor (POST /token 401)..."
        },
        "account": {
          "status": "ok",
          "detail": "Cuenta portal vinculada (…1751)",
          "customerIdSuffix": "…1751"
        },
        "operational": {
          "status": "skipped",
          "detail": "No se probó cotización: integrador API no disponible"
        }
      }
    }
  }
}
```

### `GET /api/admin/empresa/envio-config/micorreo/health`

Diagnóstico detallado solo MiCorreo para la empresa del admin autenticado.

Auth: Firebase + Admin + `empresaId`.

```json
{
  "success": true,
  "data": {
    "env": "prod",
    "integrator": { "status": "error", "detail": "..." },
    "account": {
      "status": "ok",
      "detail": "Cuenta portal vinculada (…1751)",
      "customerIdSuffix": "…1751"
    },
    "operational": { "status": "skipped", "detail": "..." },
    "readyForCheckout": false
  }
}
```

Implementación: [`correo-health.service.ts`](../src/services/shipping/correo/correo-health.service.ts), ruta en [`empresa.routes.ts`](../src/routes/empresa.routes.ts).

## Checkout — cotización de envío

`POST /api/checkout/shipping/quote` (Firebase, usuario logueado).

Si falla el integrador en `/token`, la API responde con `ShippingConfigError`:

| HTTP | `code` | Cuándo |
|------|--------|--------|
| 503 | `MICORREO_INTEGRATOR_UNAUTHORIZED` | `POST /token` → 401 |
| 502 | `MICORREO_INTEGRATOR_TOKEN_ERROR` | Otro error HTTP o respuesta sin token |
| 502 | `MICORREO_INTEGRATOR_NETWORK` | Timeout / red |
| 400 | `MICORREO_INTEGRATOR_MISCONFIGURED` | Faltan `CORREO_*` en env |

Cuerpo de error:

```json
{
  "success": false,
  "error": "Configuración",
  "message": "MiCorreo producción rechazó las credenciales API del servidor (POST /token 401)...",
  "code": "MICORREO_INTEGRATOR_UNAUTHORIZED"
}
```

**Importante:** un fallo de integrador en sync/vincular **no** marca `correo_account_status` como `invalid` si la cuenta portal ya estaba bien; solo falla la operación con el mensaje tipado.

## Logs

`POST /token` del integrador loguea en el módulo shipping:

```json
{"module":"shipping","message":"MiCorreo request start","method":"POST","path":"/token"}
{"module":"shipping","message":"MiCorreo request end","method":"POST","path":"/token","status":401,"latencyMs":42}
```

Módulo compartido: [`correo-integrator-token.ts`](../src/services/shipping/correo/correo-integrator-token.ts).

## UI admin (client)

| Pantalla | Comportamiento |
|----------|----------------|
| **Integraciones** | MiCorreo muestra fila agregada + sub-filas integrador / cuenta / operativa. Badges `Saludable`, `Listo checkout`. Cache 30s, refetch al abrir tab. |
| **Envíos** | Aviso si cuenta `active` pero integrador en error. Health vía `GET .../micorreo/health`. |

## Checklist troubleshooting

1. Confirmar `INTEGRATIONS_ENV` en el deploy (`production` en Vercel prod).
2. Probar `/token` en Postman con `CORREO_USERNAME_PROD` / `CORREO_PASSWORD_PROD`.
3. Revisar `GET /api/admin/integrations/status` → `layers.integrator`.
4. Si integrador OK y cuenta falla → Admin → Envíos → email/contraseña portal → **Guardar** → **Vincular**.
5. Si “Vincular” no usa datos del formulario: hay cambios sin guardar (`hasChanges`) — guardar primero.

## Ver también

- [integrations-env.md](./integrations-env.md) — `INTEGRATIONS_ENV` y endpoint de integraciones
- [shipping-module.md](./shipping-module.md) — módulo de envíos y checkout
- [checkout-qa-operativo.md](./checkout-qa-operativo.md) — Caso 8 MiCorreo
