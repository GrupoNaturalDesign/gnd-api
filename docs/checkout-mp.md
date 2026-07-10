# Checkout Mercado Pago (GND)

Flujo de pago con **Checkout Pro**: crear pedido en `pendiente_pago`, preferencia MP, redirección a sandbox/producción, webhook y confirmación vía `procesarPedidoConfirmado` (sin modificar `pedido-checkout.service.ts`).

## Archivos

| Ruta | Rol |
|------|-----|
| `src/services/mp-checkout.service.ts` | `crearPedidoMp`, `procesarWebhookMp`, `extractMercadoPagoPaymentId` |
| `src/controllers/checkout.controller.ts` | `POST /mp`, `GET /resultado` |
| `src/controllers/webhook-mp.controller.ts` | Webhook público, 200 inmediato + procesamiento async |
| `src/routes/checkout.routes.ts` | Rutas bajo `/api/checkout` |
| `src/routes/webhook-mp.routes.ts` | `POST /api/webhooks/mercadopago` |

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `MERCADOPAGO_ACCESS_TOKEN_TEST` / `MERCADOPAGO_ACCESS_TOKEN` | Igual que en [`mercadopago-client.md`](./mercadopago-client.md) |
| `MERCADOPAGO_ENV` + `NODE_ENV` | Modo sandbox vs producción |
| `NGROK_URL` | Base HTTPS pública **sin** barra final (ej. `https://xxx.ngrok-free.dev`). Usada en `notification_url` y `back_urls`. |
| `EMPRESA_ID` | Entero: empresa del pedido (monotienda / pruebas). |

Ejemplo:

```env
MERCADOPAGO_ACCESS_TOKEN_TEST=TEST-...
NGROK_URL=https://tu-subdominio.ngrok-free.dev
EMPRESA_ID=1
```

## Modelo `Pedido`

- `estadoInterno`: `pendiente_pago` al crear.
- `formaPago`: `mercadopago`.
- `mpPreferenceId`: id de la preferencia devuelto por MP.
- Tras el webhook: `mercadoPagoPaymentId`, `mercadoPagoStatus`; si el pago queda `approved`, se llama a `procesarPedidoConfirmado(pedidoId)` (stock + SFactory, etc.).

Migración: columna `mp_preference_id` (`mpPreferenceId` en Prisma).

Si `migrate deploy` falla con **P3005** en una base que ya tenía tablas, ver **[`prisma-baseline.md`](./prisma-baseline.md)**.

## API

### `POST /api/checkout/mp`

- **Auth:** `Authorization: Bearer <Firebase ID token>`.
- **Body:** `items[]` (no vacío), `clienteNombre`, `clienteEmail`; opcionales `clienteTelefono`, `clienteDireccion`, `observaciones`. Cada ítem: `productoWebId`, `productoPadreId`, `sfactoryItemId`, `nombre`, `codigo`, `cantidad`, `precioUnitario`, `talle?`, `color?`.
- **`empresaId`:** tomado de `EMPRESA_ID` (no del body).
- **Respuesta:** `{ success, data: { pedidoId, checkoutUrl, preferenceId } }`.

### `GET /api/checkout/resultado`

- **Público** (back_url de MP).
- Respuesta: `{ success: true, message: 'Resultado recibido' }`.

### `POST /api/webhooks/mercadopago`

- **Sin auth.**
- Responde `200` de inmediato; el procesamiento corre en `setImmediate`.
- Body/query según MP: se extrae el id de pago de `data.id`, `?id=`, o `resource` con URL de pago.

## Flujo de prueba (sandbox)

1. `npx prisma migrate deploy` (incluye `mp_preference_id`).
2. Configurar `.env` (token TEST, `NGROK_URL`, `EMPRESA_ID`).
3. Exponer el API con ngrok y registrar en el panel de MP la misma URL base para webhooks si hace falta (o confiar en `notification_url` de la preferencia).
4. `POST /api/checkout/mp` con usuario Firebase existente en BD (`externalId` = uid).
5. Abrir `checkoutUrl` (sandbox), pagar con tarjeta de prueba.
6. Revisar logs `[WebhookMP]` y que el pedido pase a confirmado tras `procesarPedidoConfirmado`.

## Qué no incluye esta iteración

- Validación de firma / secret del webhook.
- Emails ni auditoría extra.

## Cliente HTTP

Sigue usando `mercadopagoClient` de [`api/src/services/mercadopago/`](./mercadopago-client.md).
