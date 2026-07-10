# Módulo de envíos (GND)

Documentación del sistema de envíos integrado en el API: tipos compartidos, proveedores (Correo Argentino / Andreani), servicio de orquestación, persistencia y rutas HTTP.

## Qué está integrado

- **Capa de dominio**: tipos (`CreateShippingOrderInput`, `ShippingParcel`, etc.), interfaz `ShippingProvider` y errores tipados (`ShippingValidationError`, `ShippingConfigError`, `ShippingHttpError`, `ShippingMethodNotSupportedError`, etc.).
- **Persistencia (Prisma)**:
  - `EmpresaEnvioConfig`: credenciales y opciones por empresa (sin API keys globales en `.env`).
  - `Pedido`: `correoTrackingNumber`, `formaEnvio` ampliado con valores **Correo** (`correo_sucursal`, `correo_domicilio`).
  - `PedidoEnvioLog`: auditoría **antes/después** de cada operación (`*_before` / `*_after` en `operacion`).
- **Correo Argentino (PaqAr)**: cliente HTTP en `correo.provider.ts` (base URL test/prod, headers `Apikey` + `agreement`), mappers en `correo.mapper.ts`, códigos de provincia en `CORREO_ARG_PROVINCE_CODES` (`correo.types.ts`).
- **Andreani**: `AndreaniProvider` como **stub** — todos los métodos lanzan `ShippingMethodNotSupportedError` con mensaje *"Andreani: método no implementado todavía"*.
- **Servicio central**: `ShippingService` (`shipping.service.ts`) resuelve proveedor según `EmpresaEnvioConfig`, escribe logs, actualiza `Pedido` tras crear orden (tracking + `formaEnvio`; **no** cambia `estadoInterno` a `despachado`).
- **API REST** (solo lo expuesto hoy): rutas bajo `/api/shipping`, autenticación interna.

## Implementación (referencia de archivos)

| Ruta en `api/src/` | Contenido |
|--------------------|-----------|
| `lib/shipping-logger.ts` | Logs en JSON por línea (sin `console.log` en el módulo de envíos). |
| `services/shipping/shipping.types.ts` | Tipos compartidos obligatorios. |
| `services/shipping/shipping.errors.ts` | Errores de dominio y HTTP del proveedor. |
| `services/shipping/shipping.provider.ts` | Interface `ShippingProvider`. |
| `services/shipping/shipping.service.ts` | Orquestación, Prisma, logs, actualización de pedido. |
| `services/shipping/correo/*` | Config, tipos provincia, mapper, `CorreoProvider`, `correo-integrator-token`, `correo-health.service`. |
| `services/shipping/andreani/andreani.provider.ts` | Stub Andreani. |
| `services/shipping/index.ts` | Reexporta el módulo (+ `CORREO_ARG_PROVINCE_CODES`). |
| `middleware/shipping-empresa.middleware.ts` | Exige usuario con `empresaId` (sesión Firebase). |
| `controllers/shipping.controller.ts` | Validación Zod, mapeo de errores → HTTP. |
| `routes/shipping.routes.ts` | Registro de rutas con middlewares. |

Migración SQL: `prisma/migrations/20260402120000_add_shipping_module/migration.sql`.

## Variables de entorno

**Modo test/prod unificado:** `INTEGRATIONS_ENV` controla MP, MiCorreo y Andreani en runtime. Ver [`integrations-env.md`](./integrations-env.md).

| Variable | Rol |
|----------|-----|
| `INTEGRATIONS_ENV` | `test` (default) o `production` — fuente de verdad del entorno |
| `SHIPPING_DEFAULT_PROVIDER` | Valor por defecto al **crear** `EmpresaEnvioConfig` (p. ej. `correo` o `andreani`) |
| `CORREO_USERNAME_QA` / `CORREO_PASSWORD_QA` / `CORREO_USERNAME_PROD` / `CORREO_PASSWORD_PROD` | Usuario **integrador** API MiCorreo (`POST /token`). Distinto del email de cuenta portal. |
| Cuenta comercial MiCorreo | **Admin → Configuración → Envíos** (`empresa_envio_config`: email, password cifrada, customerId, CP/provincia origen, remitente) |
| `INTEGRATIONS_SECRETS_ENCRYPTION_KEY` | Cifrado AES-256-GCM de claves MiCorreo en BD |

Diagnóstico MiCorreo en capas: [`micorreo-health.md`](./micorreo-health.md).

**Deprecated (conflicto con `INTEGRATIONS_ENV` → error al arrancar):** `CORREO_DEFAULT_ENV`, `ANDREANI_DEFAULT_ENV`, `CORREO_ENV`.

**Mercado Pago** (checkout): modo según `INTEGRATIONS_ENV`; tokens sandbox → `MERCADOPAGO_ACCESS_TOKEN_TEST` / `_QA`; producción → `MERCADOPAGO_ACCESS_TOKEN_PROD`.

Ejemplo en `.env` (ver también `.env.example`):

```env
INTEGRATIONS_ENV=test
SHIPPING_DEFAULT_PROVIDER=andreani
```

**Por empresa (BD)**, en `EmpresaEnvioConfig`: `correoSenderData` (JSON del remitente), `providerDefault`, credenciales de cuenta portal y campos opcionales legacy (`correoApiKey`, etc.). Los campos `correoEnv` / `andreaniEnv` son observabilidad; el runtime usa `INTEGRATIONS_ENV`.

### Checkout — cotización (`POST /api/checkout/shipping/quote`)

Auth Firebase (cualquier usuario logueado). Usa `EMPRESA_ID` del entorno para resolver `EmpresaEnvioConfig`.

Errores de configuración MiCorreo (integrador) devuelven `ShippingConfigError` con `httpStatus` y `code` (p. ej. `MICORREO_INTEGRATOR_UNAUTHORIZED` → 503). Detalle: [micorreo-health.md](./micorreo-health.md).

### Admin — health MiCorreo

`GET /api/admin/empresa/envio-config/micorreo/health` — capas integrador / cuenta / operativa. Ver [micorreo-health.md](./micorreo-health.md).

## API HTTP

**Prefijo:** ` /api/shipping`

**Autenticación (todas las rutas):**

1. `Authorization: Bearer <Firebase ID token>`
2. Usuario con rol **ADMIN** (`requireAdmin`)
3. Usuario con **`empresaId`** no nulo (`shippingEmpresaMiddleware`)

### `POST /api/shipping/orders`

Crea la orden en el proveedor (Correo si está configurado) y actualiza el pedido: tracking (`correoTrackingNumber` o `andreaniNumeroEnvio`) y `formaEnvio`. No pasa el pedido a `despachado`.

Body (JSON) — campos principales:

- `pedidoId` (number, obligatorio)
- `provider` (opcional: `correo` | `andreani`; si falta → `providerDefault` de `EmpresaEnvioConfig`)
- `deliveryType`: `homeDelivery` | `agency`
- `agencyId` (obligatorio si `deliveryType === 'agency'`)
- `recipient`: `{ name, email?, phone? }`
- `address` (obligatorio si envío a domicilio): calle, ciudad, provincia, CP, etc.
- `parcel`: peso, dimensiones, valor declarado

### `GET /api/shipping/agencies`

Query opcionales: `provider`, `stateId`, `pickup`, `reception` (booleanos como string `true`/`false`).

### `GET /api/shipping/tracking`

Consulta libre de seguimiento (sin pedido). Requiere auth admin + `empresaId`.

Query:

- `provider` — `correo` | `andreani` (obligatorio)
- `trackingNumber` — nº de envío (obligatorio)

Respuesta: `{ results: ShippingTrackingResult[], trackingUrl?: string }`.

### `GET /api/shipping/orders/:pedidoId/tracking`

Seguimiento asociado a un pedido. Si no se envía `numbers`, el servicio toma el nº del pedido según el proveedor.

Query:

- `provider` — `correo` | `andreani` (opcional; default → `providerDefault` de `EmpresaEnvioConfig`)
- `numbers` — uno o más nº separados por coma (opcional)

Respuesta: `results` (array de eventos por número).

Helper compartido: `resolvePedidoShippingTracking()` en `api/src/utils/pedido-shipping-tracking.util.ts`.

## Cómo testear (lo más importante)

1. **Migración aplicada**  
   `cd api && npx prisma migrate deploy` (o `migrate dev` en desarrollo).

2. **Config de envíos para la empresa**  
   Debe existir (o crearse al primer uso) un registro en `EmpresaEnvioConfig` para el `empresaId` del usuario admin. Para **Correo en serio**, completar `correoApiKey` y `correoAgreement` según el contrato PaqAr. Sin credenciales válidas, `validateCredentials` / `createOrder` fallarán contra la API real.

3. **Usuario de prueba**  
   Admin en Firebase con el mismo usuario vinculado a una **empresa** en BD (`usuarios.empresa_id`).

4. **Pedido**  
   Un `Pedido` existente con `id` y `empresaId` coincidente con el del usuario.

5. **Llamada HTTP**  
   Ejemplo con `curl` (sustituir token, host y cuerpo):

   ```bash
   curl -s -X POST "http://localhost:3003/api/shipping/orders" \
     -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
     -H "Content-Type: application/json" \
     -d "{\"pedidoId\":1,\"deliveryType\":\"agency\",\"agencyId\":\"SUC001\",\"recipient\":{\"name\":\"Test\"},\"parcel\":{\"weightGrams\":500,\"height\":10,\"width\":10,\"depth\":10,\"declaredValue\":1000}}"
   ```

6. **Verificación en BD**  
   - `pedidos.correo_tracking_number` / `andreani_numero_envio` y `forma_envio`.  
   - `pedidos_envio_logs` con filas `create_order_before` / `create_order_after`.

7. **Postman**  
   En `api/postman/`: importar **`GND-Shipping.postman_collection.json`** y el environment **`GND-Shipping.local.postman_environment.json`**. En el environment, definí **`firebaseIdToken`** (ID token de un admin con `empresaId` en BD) y ajustá **`baseUrl`** / **`pedidoId`** si hace falta. Con **`ANDREANI_MOCK`** / **`CORREO_MOCK`** en `.env` del API podés probar sin llamar a los proveedores reales.

8. **Andreani**  
   Ver [`andreani-integration.md`](./andreani-integration.md) para variables y flujo; el checkout usa el mismo prefijo `/api/shipping`.

## Comportamiento frente al proveedor Correo

Las rutas HTTP del Correo (`/auth`, `/orders`, `/labels`, `/tracking`, `/agencies`) están alineadas con una base tipo `.../paqar/v1`. Si el contrato oficial de PaqAr difiere (paths, nombres de campos JSON, query de tracking), hay que ajustar **`correo.provider.ts`** y **`correo.mapper.ts`** sin cambiar la interfaz pública `ShippingProvider`.

## Alta automática post-confirmación (checkout web)

Tras `procesarPedidoConfirmado` (pago MP aprobado **o** confirmación manual transferencia/efectivo), si el pedido **no** es retiro en tienda:

1. `finalizeShippingAfterPaymentApproved` (`checkout-shipping-finalize.service.ts`) arma `CreateShippingOrderInput` desde `checkoutEnvioSnapshot` y llama `shippingService.createOrder`.
2. Persiste `andreaniNumeroEnvio` / `correoTrackingNumber` y `trackingUrl`.
3. Email `SHIPPED` con tracking (desde `shipping.service`) y email `CONFIRMED` con número si ya está en BD.
4. Job cada 15 min: `reintentarEnviosPostalPendientes` para confirmados sin número.
5. Admin: `POST /api/admin/pedidos/:id/crear-envio` para reintento manual.

**Etiqueta de envío (admin pedidos):**

- `GET /api/admin/pedidos/:id/etiqueta/disponibilidad` — metadata (`canDownload`, `reason`, `provider`) para habilitar/deshabilitar descarga en UI.
- `GET /api/admin/pedidos/:id/etiqueta` — descarga PDF Andreani (`Content-Disposition: attachment`). Query opcional `?format=json` devuelve `fileBase64`.
- **Andreani:** requiere orden creada (`andreaniNumeroEnvio` + `andreaniAgrupadorBultos`). **Correo (MiCorreo):** `canDownload: false`, reason `correo_portal_only` — etiqueta solo desde portal web.
- El detalle `GET /api/admin/pedidos/:id` incluye campo calculado `shippingLabel`.

**No** se crea envío al crear el pedido (`crearPedidoManual` / MP pendiente): solo al confirmar.

## Qué falta o está fuera de alcance actual

- **Etiqueta Correo vía API:** requeriría integración Paq.Ar `/v1/labels` (MiCorreo no expone etiquetas).
- **Rutas HTTP** para `cancelOrder`: la lógica está en `ShippingService`; no expuesta en admin.
- **Tests automatizados**: unit tests con `fetch` mockeado en `CorreoProvider` / `ShippingService`.
- **Alineación fina con PaqAr**: validar contra el manual vigente (creación de orden, etiquetas, tracking).
- **Encriptación de secretos** en `EmpresaEnvioConfig` (opcional, seguridad).

## Ver también

- [`checkout-sfactory-pedidos.md`](./checkout-sfactory-pedidos.md) — flujo de pedidos y estados.
