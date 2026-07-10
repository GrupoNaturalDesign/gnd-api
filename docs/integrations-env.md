# Integraciones — entorno unificado (`INTEGRATIONS_ENV`)

Una sola variable en el `.env` del API define si **Mercado Pago**, **MiCorreo (Correo Argentino)** y **Andreani** operan en **test** o **production**. Sin toggle en el panel admin: solo el dev/owner configura el servidor.

Implementación: [`api/src/lib/integrations-mode.ts`](../src/lib/integrations-mode.ts).

## Variable maestra

| Valor | Modo | Aliases aceptados |
|-------|------|-------------------|
| `test` (default si falta) | QA / sandbox | `qa`, `sandbox`, `development`, `dev`, `apitest` |
| `production` | Live | `prod`, `live` |

```env
# Perfil local / staging
INTEGRATIONS_ENV=test

# Perfil servidor live
INTEGRATIONS_ENV=production
```

Al arrancar el API se validan credenciales del modo activo y se loguea el perfil. `GET /health` incluye `integrationsMode`.

## Qué activa cada modo

| Integración | test | production |
|-------------|------|------------|
| Mercado Pago | Sandbox — `MERCADOPAGO_ACCESS_TOKEN_TEST` / `_QA` | Live — `MERCADOPAGO_ACCESS_TOKEN_PROD` |
| MiCorreo | `apitest…` — `CORREO_USERNAME_QA` / `CORREO_PASSWORD_QA` (integrador API). **Cuenta comercial** (email, clave, customerId, CP origen) en **Admin → Configuración → Envíos** (`empresa_envio_config`). | `api…` — `CORREO_*_PROD` integrador. Cuenta comercial en BD por empresa. |
| Andreani | `https://apisqa.andreani.com` — `ANDREANI_*_QA` | `https://apis.andreani.com` — `ANDREANI_*_PROD` |

Override Andreani: `ANDREANI_BASE_URL`.

## Perfil DEV/QA (ejemplo)

```env
INTEGRATIONS_ENV=test
NODE_ENV=development

MERCADOPAGO_ACCESS_TOKEN_TEST=...

CORREO_USERNAME_QA=...
CORREO_PASSWORD_QA=...
INTEGRATIONS_SECRETS_ENCRYPTION_KEY=...
# Cuenta MiCorreo: panel Admin → Envíos (no CORREO_EMAIL_* en env)

ANDREANI_USERNAME_QA=...
ANDREANI_PASSWORD_QA=...
ANDREANI_CLIENTE=...
ANDREANI_CONTRATO_DOM=...
```

Mocks locales (opcional): `CORREO_MOCK=true`, `ANDREANI_MOCK=true` — omiten validación de credenciales Correo/Andreani al arrancar.

## Perfil PROD (ejemplo)

```env
INTEGRATIONS_ENV=production
NODE_ENV=production

MERCADOPAGO_ACCESS_TOKEN_PROD=...
MP_WEBHOOK_URL=https://tudominio.com/api/webhooks/mercadopago

CORREO_USERNAME_PROD=...
CORREO_PASSWORD_PROD=...
CORREO_EMAIL_PROD=...

ANDREANI_USERNAME_PROD=...
ANDREANI_PASSWORD_PROD=...
```

## Variables deprecated

Si están seteadas **en conflicto** con `INTEGRATIONS_ENV`, el API **no arranca**:

- `MERCADOPAGO_ENV`
- `CORREO_DEFAULT_ENV`
- `ANDREANI_DEFAULT_ENV`
- `CORREO_ENV`

Eliminarlas del `.env` al migrar.

## BD (`EmpresaEnvioConfig`)

Los campos `correo_env` / `andreani_env` se persisten al crear la fila (observabilidad) pero **no controlan el runtime**. El entorno efectivo siempre viene de `INTEGRATIONS_ENV`.

Siguen en BD: `providerDefault`, `correoSenderData`, credenciales legacy opcionales.

## Checklist deploy a producción

1. Setear `INTEGRATIONS_ENV=production` en el `.env` del servidor.
2. Completar credenciales `*_PROD` de MP, Correo y Andreani.
3. Configurar `MP_WEBHOOK_URL` (HTTPS).
4. Quitar variables deprecated del `.env`.
5. Reiniciar API y verificar log `[integrations] INTEGRATIONS_ENV=production — ...`.
6. Confirmar `GET /health` → `"integrationsMode": "prod"`.
7. Probar cotización checkout (Correo y/o Andreani) y un pago MP de prueba controlada.

## Verificación de estado: `GET /api/admin/integrations/status`

Endpoint protegido (Firebase Auth + Admin) que verifica **configuración y conectividad** de las tres integraciones en un solo llamado.

**MiCorreo en capas:** el objeto `integrations.correo` distingue API integrador (`POST /token`) de cuenta portal (BD). Ver [micorreo-health.md](./micorreo-health.md).

### Response

```json
{
  "success": true,
  "mode": "test",
  "modeRaw": "test",
  "timestamp": "2026-06-02T12:00:00.000Z",
  "integrations": {
    "mercadopago": {
      "configured": true,
      "status": "ok",
      "mode": "sandbox",
      "detail": "Token válido, API responde correctamente"
    },
    "correo": {
      "configured": true,
      "status": "ok",
      "mode": "test",
      "detail": "Integrador y cuenta portal OK (…1751)",
      "healthy": true,
      "readyForCheckout": true,
      "layers": {
        "integrator": {
          "status": "ok",
          "detail": "API integrador OK (POST /token, test/sandbox)"
        },
        "account": {
          "status": "ok",
          "detail": "Cuenta portal vinculada (…1751)",
          "customerIdSuffix": "…1751"
        },
        "operational": {
          "status": "ok",
          "detail": "Validate de cuenta portal OK"
        }
      }
    },
    "andreani": {
      "configured": true,
      "status": "ok",
      "mode": "test",
      "detail": "Login exitoso, credenciales válidas"
    }
  }
}
```

### Estados posibles por integración

| status | Significado |
|--------|-------------|
| `ok` | Configurado + API responde |
| `mock` | Modo mock activo (`CORREO_MOCK` / `ANDREANI_MOCK`); no se chequeó conexión |
| `misconfigured` | Token/credenciales faltantes |
| `error` | Error de conexión, timeout o credenciales inválidas |

**MiCorreo — capas (`layers.*.status`):** `ok` | `error` | `misconfigured` | `skipped`.

| Flag correo | Significado |
|-------------|-------------|
| `healthy` | Integrador **y** cuenta portal OK |
| `readyForCheckout` | Además, validación operativa (`validate`) OK |

Si `layers.integrator.status === "error"`, el `correo.status` agregado es `error` aunque la cuenta figure vinculada en Envíos.

### Casos borde

- **Mock**: Correo/Andreani en modo mock reportan status `mock` sin intentar conexión real.
- **Timeout**: si una API externa no responde, solo esa integración se reporta como `error`; las demás siguen funcionando.
- **Fallos parciales**: cada integración se chequea en paralelo; un error nunca derriba el endpoint completo.
- **Integrador vs cuenta MiCorreo**: pueden fallar de forma independiente; ver [micorreo-health.md](./micorreo-health.md).

Implementación: [`api/src/controllers/integrations.controller.ts`](../src/controllers/integrations.controller.ts), [`api/src/services/shipping/correo/correo-health.service.ts`](../src/services/shipping/correo/correo-health.service.ts), [`api/src/routes/integrations.routes.ts`](../src/routes/integrations.routes.ts).

## Ver también

- [micorreo-health.md](./micorreo-health.md) — troubleshooting integrador vs cuenta, health endpoint, errores checkout
- [shipping-module.md](./shipping-module.md)
- [andreani-integration.md](./andreani-integration.md)
