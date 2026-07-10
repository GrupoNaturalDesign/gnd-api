# Andreani — integración de envíos

## Ubicación en código

- Configuración y env: `api/src/services/shipping/andreani/andreani.config.ts`.
- HTTP y auth: `andreani.auth.service.ts`, `andreani.http.ts`.
- Cotización, preenvío, envío: `andreani.cotizacion.service.ts`, `andreani.preenvio.service.ts`, `andreani.envio.service.ts`.
- Proveedor unificado: `api/src/services/shipping/andreani/andreani.provider.ts` (implementa `ShippingProvider`).
- Mapeo de pedido a JSON de orden (API v2): `andreani.mapper.ts`.
- Orquestación desde checkout: `api/src/services/shipping/shipping.service.ts` (`quoteAndreani`, etc.).

## Entornos

- **Modo:** `INTEGRATIONS_ENV` (`test` | `production`). Ver [`integrations-env.md`](./integrations-env.md).
- **URLs:** por defecto QA `https://apisqa.andreani.com`, prod `https://apis.andreani.com`. Override con `ANDREANI_BASE_URL`.
- **Credenciales:** según `INTEGRATIONS_ENV` (`test` → `ANDREANI_*_QA`, `production` → `ANDREANI_*_PROD`). Prioridad en `loadAndreaniCredentials` (fallbacks `ANDREANI_USERNAME` / `ANDREANI_PASSWORD`).

## Paths API (override por env)

| Env | Default |
|-----|---------|
| `ANDREANI_PATH_LOGIN` | `/login` |
| `ANDREANI_PATH_COTIZAR` | `/v1/tarifas` |
| `ANDREANI_PATH_ORDENES_ENVIO` | `/v2/ordenes-de-envio` |
| `ANDREANI_PATH_ENVIOS` | `/v2/envios` |

## Variables operativas frecuentes

| Variable | Rol |
|----------|-----|
| `ANDREANI_CLIENTE` | Código de cliente Andreani (obligatorio para cotización/alta) |
| `ANDREANI_CONTRATO_DOM` | Contrato domicilio |
| `ANDREANI_CONTRATO_SUC` | Contrato sucursal |
| `ANDREANI_SUCURSAL_ORIGEN` | Sucursal origen si aplica |
| `ANDREANI_ORIGEN_CP` | CP origen (default `5000`) |
| `ANDREANI_TIPO_SERVICIO` / `ANDREANI_TIPO_DE_SERVICIO` | Tipo de servicio en alta (default `B2C`) |
| `ANDREANI_SUCURSAL_CLIENTE_ID` | `sucursalClienteID` en JSON |
| `ANDREANI_MOCK` | Simular integración si `true`/`1`/`yes` |
| `ANDREANI_TOKEN_HEADER` | Nombre de header de token (default `x-authorization-token`) |
| `ANDREANI_TIMEOUT_MS` | Timeout de request (default 45000) |
| `ANDREANI_ORIGEN_*` / `ANDREANI_REMITENTE_*` | Dirección y datos de remitente para órdenes (ver `loadAndreaniOrigenPostal`, `loadAndreaniRemitente`) |

## Flujo de negocio

- **Cotización:** `ShippingService.quoteAndreani` exige provider Andreani, `ANDREANI_CLIENTE` y el contrato según `homeDelivery` vs retiro en sucursal.
- **Alta de orden:** `AndreaniProvider.createOrder` arma cuerpo vía `mapPedidoToAndreaniOrdenEnvio` y llama a preenvío/órdenes según servicios.

## Notas

- Errores de validación: `ShippingValidationError` y derivados de `shipping.errors`.
- Cualquier cambio de contrato o JSON de Andreani debe alinearse con comentarios en `andreani.mapper.ts` (estructura v2).
