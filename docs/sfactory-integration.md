# S-Factory — integración API

## Resumen

Sincronización de catálogo, clientes, stock y **pedidos ecommerce** hacia S-Factory. Autenticación por token almacenado en BD por `companyKey` (empresa).

## Ubicación en código

- Cliente genérico: `api/src/services/sfactory/sfactory.client.ts` — construye body `auth` + `service` (`module`, `method`) + `credential` (token, `companyKey`) + `parameters`; POST al endpoint `.../main` (normaliza `SFACTORY_API_URL`).
- Auth y token: `api/src/services/sfactory/sfactory-auth.service.ts` — login `Auth/sign_in` contra `sign_in`, persistencia de token por empresa.
- Servicios de dominio: `api/src/services/sfactory/sfactory.service.ts`.
- Tipos: `api/src/types/sfactory.types.ts`.

## Variables de entorno (mínimas)

| Variable | Uso |
|----------|-----|
| `SFACTORY_API_URL` | Base URL (ej. `https://sfactory-api.com.ar/sfactory/api`) |
| `SFACTORY_USERDEV` / `SFACTORY_PASSWORD` | Credenciales `auth` en requests |
| `SFACTORY_USER_FACTORY` / `SFACTORY_PASSWORD_FACTORY` | Parámetros de `sign_in` |
| `SFACTORY_COMPANY_KEY` | Default de empresa si no se pasa otro |
| `SFACTORY_PEDIDO_EXTERNO_SOURCE` | Debe alinearse con `external_orders_config` en S-Factory para pedidos externos |

## Comportamiento del cliente

- Obtiene token vía `sfactoryAuthService.getToken(companyKey)`; si falla, invalida y reintenta.
- Timeout de request: 120 s (`AbortController`).
- En desarrollo loguea `module`/`method` y reintentos.

## Pedidos externos (ecommerce)

No usar `ventas_crear_orden_pedido` para el flujo web actual: el checkout usa **`ventas_crear_pedido_externo`**. Detalle del pipeline en [checkout-sfactory-pedidos.md](./checkout-sfactory-pedidos.md).

- Endpoint de prueba admin: `POST /api/sfactory/ventas/pedido-externo` (auth Firebase + admin), esquema Zod en `src/validation/sfactory-pedido-externo.schema.ts`.

## Inventario / stock remoto

Limitaciones del método `inventory_stock_items_by_warehouse_v2`: ver [sfactory-inventory-stock.md](./sfactory-inventory-stock.md).

## Sync optimizado (hash / diff)

Las sincronizaciones evitan writes innecesarios comparando hashes en memoria. Stats, env vars y checklist QA: [sync-optimization.md](./sync-optimization.md).
