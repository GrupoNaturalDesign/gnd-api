# Modo mantenimiento

Control unificado de disponibilidad de la **tienda pública** y del **panel admin**, vía variable de entorno `MAINTENANCE_MODE`.

Debe configurarse en **API** y en **cliente Next** con el mismo valor. Reiniciar ambos procesos tras cambiarla.

## Valores (`MAINTENANCE_MODE`)

| Valor | Tienda / auth cliente (front + API pública) | Panel `/admin` (front + API admin) |
|-------|-----------------------------------------------|-------------------------------------|
| `off` | Normal | Normal |
| `public` | Mantenimiento | Normal (API admin operativa) |
| `admin` | Normal | Mantenimiento |
| `all` | Mantenimiento | Mantenimiento |

Valores inválidos → `off` (la API registra warning en consola al arrancar).

## Variables de entorno

| Servicio | Archivo de referencia |
|----------|------------------------|
| API | `api/.env.example` → `api/.env` |
| Cliente | `client/.env.example` → `client/.env.local` |

```env
MAINTENANCE_MODE=off
```

## Activación recomendada

1. `MAINTENANCE_MODE=public` (o `admin` / `all`) en **API** → reiniciar servidor.
2. Mismo valor en **cliente** → reiniciar `next dev` o redeploy.
3. Verificar `GET /api/health` y webhook MP si aplica.
4. Trabajo (migración / deploy).
5. `MAINTENANCE_MODE=off` en API y cliente.

**Cerrar tienda:** API primero, luego cliente (evita UI viva con API en 503).

## Respuesta API bloqueada

HTTP **503**:

```json
{
  "success": false,
  "error": "Servicio en mantenimiento",
  "message": "...",
  "code": "MAINTENANCE",
  "scope": "public"
}
```

`scope`: `public` | `admin`.

## Rutas que nunca se bloquean

- `GET /health` y `GET /api/health`
- `POST /api/webhooks/*` (Mercado Pago)
- `POST /api/orders/status` (callback ERP)

Jobs de checkout y socket siguen activos.

## Frontend

- Rutas bloqueadas → redirect **307** a `/maintenance?scope=...` con `Retry-After: 1800`.
- Route Handlers `client/src/app/api/*` → 503 en `public` o `all`.
- `apiClient`, `useApiMutation`, `AuthContext` y `usuario.service` redirigen ante `code: MAINTENANCE`.
- Sin newsletter popup en `/maintenance`.

## Casos borde

- **Vuelta desde Mercado Pago** con `public`: pantalla de mantenimiento; pago vía webhook + jobs.
- **Desarrollo:** reiniciar `next dev` tras cambiar env.

## Tests

```bash
# API
cd api
npm test -- tests/maintenance-mode.test.ts tests/maintenance.middleware.test.ts

# Cliente
cd client
npm run test:run -- src/lib/maintenance-mode.test.ts src/lib/maintenance-routes.test.ts src/lib/api-maintenance.test.ts
```

## Archivos de referencia

- `api/src/lib/maintenance-mode.ts`
- `api/src/lib/maintenance-paths.ts`
- `api/src/middleware/maintenance.middleware.ts`
- `client/src/lib/maintenance-mode.ts` (espejo — mantener sincronizado)
- `client/src/lib/maintenance-routes.ts`
- `client/src/lib/api-maintenance.ts`
- `client/src/middleware.ts`
