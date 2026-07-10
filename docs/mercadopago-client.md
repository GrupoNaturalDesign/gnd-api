# Mercado Pago — cliente, checkout y webhooks

## Ubicación en código

- Cliente HTTP: `api/src/services/mercadopago/mercadopago.client.ts` (`MercadoPagoClient`).
- Configuración y token: `api/src/services/mercadopago/mercadopago.config.ts`.
- Tipos: `api/src/services/mercadopago/mercadopago.types.ts`.
- Flujo de pedido + preferencia + webhook: `api/src/services/mp-checkout.service.ts`.
- Orquestación webhook + log: `api/src/services/mp-webhook-log.service.ts` (`handleMercadoPagoWebhookNotification`), modelo `MpWebhookLog` en Prisma.
- Verificación de firma: `api/src/utils/mercadopago-webhook-signature.ts`.
- Controlador webhook: `api/src/controllers/webhook-mp.controller.ts` (firma, rate limit, **procesamiento síncrono antes del 200**).
- Polling estado pago: `GET /api/checkout/payment-status/:pedidoId` (Firebase) en `checkout.routes.ts` / `checkout.controller.ts`.
- Job reconciliación: `reconciliarPedidosMpAtascados` en `mp-checkout.service.ts`, programado en `api/src/jobs/pedido-checkout.jobs.ts`.
- Cotización de cuotas en catálogo (proveedor MP): ver [installment-providers.md](./installment-providers.md).

## Flujo (creación → MP → webhook → confirmación)

1. El cliente autenticado llama `POST /api/checkout/mp` con ítems y datos de contacto (y opcionalmente envío / cupón).
2. La API crea un `Pedido` en `pendiente_pago` con `expiresAt`, arma la preferencia MP (`external_reference`: `pedido_<id>`) y guarda `mpPreferenceId`.
3. El comprador paga en Mercado Pago; MP notifica `POST /api/webhooks/mercadopago` (y opcionalmente redirige a `back_urls` con `?mp_return=success|pending|failure`).
4. El webhook valida firma (si hay `MERCADOPAGO_WEBHOOK_SECRET`), deduplica por `x-request-id` (tabla `mp_webhook_logs`), **procesa de forma síncrona** vía `handleMercadoPagoWebhookNotification`, obtiene el pago con reintentos breves, valida `preference_id`, monto (`total - descuento` del pedido), `collector_id` en live, y:
   - **approved** (y pedido aún `pendiente_pago`): lock MySQL `GET_LOCK`, reclamo atómico de `mercadoPagoPaymentId`, luego `procesarPedidoConfirmado` → S-Factory según [checkout-sfactory-pedidos.md](./checkout-sfactory-pedidos.md).
   - **pending / in_process**: persiste `mercadoPagoPaymentId` y estado MP en el pedido.
   - **rejected / cancelled / …**: marca `fallido` si seguía `pendiente_pago`.
5. **Solo después** de procesar (y actualizar `mp_webhook_logs`) se responde a MP.
6. El frontend puede hacer polling a `GET /api/checkout/payment-status/:pedidoId` mientras `mp_return=pending`.
7. Job `procesarPedidosVencidos`: vence pedidos `pendiente_confirmacion` **y** `pendiente_pago` (solo `formaPago = mercado_pago`) cuando `expiresAt` pasó (por defecto 120 min desde la creación del pedido MP).
8. Job `reconciliarPedidosMpAtascados` (cada 5 min): recupera pedidos `pendiente_pago` con pago `approved` ya persistido o busca pagos approved por `external_reference`.

## Duplicados y logs atascados

- Si MP reenvía la misma notificación (`x-request-id` duplicado), **igual se ejecuta** `procesarWebhookMercadoPago` (idempotente).
- Si el log quedó en `detail = received` (primer intento no terminó), el reenvío repara el log (`stale_received_repaired`).
- MP puede reintentar si la API responde **500** (p. ej. pago aún no visible en la API tras `payment.created`).

## Respuestas HTTP al webhook

| Situación | HTTP | Notas |
|-----------|------|-------|
| Confirmado / pending manejado / validación de negocio | **200** | MP no reintenta |
| Pago no encontrado en MP (`paymentStatus = unknown`) | **500** | MP reintenta (timing) |
| Error inesperado (DB, lock, etc.) | **500** | MP reintenta |
| Firma inválida | **401** | |
| Secreto requerido no configurado | **503** | |

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `INTEGRATIONS_ENV` | `test` vs `production` — define token MP (ver [integrations-env.md](./integrations-env.md)) |
| `MERCADOPAGO_ACCESS_TOKEN` (y `_PROD`, `_TEST`, `_QA`) | Token API |
| `MP_WEBHOOK_URL` | URL **completa** del webhook, ej. `https://tudominio.com/api/webhooks/mercadopago`. Obligatoria en **live**. Si no está definida y no es live, se usa `NGROK_URL` + `/api/webhooks/mercadopago`. |
| `NGROK_URL` | Fallback de webhook en sandbox/dev si no hay `MP_WEBHOOK_URL`. También base de `back_urls` si no hay `CHECKOUT_PUBLIC_URL`. |
| `CHECKOUT_PUBLIC_URL` | Base del sitio para `back_urls` (`…/checkout/pago-resultado?mp_return=…`). |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto de firma del panel MP. Si está definido, la API **valida** `x-signature` en cada webhook. |
| `MP_WEBHOOK_SIGNATURE_REQUIRED` | En live, por defecto exige el secreto (`false` / `0` para desactivar la exigencia — no recomendado). |
| `MERCADOPAGO_COLLECTOR_ID` | En live, si está definido, el `collector_id` del pago debe coincidir. |
| `CHECKOUT_MP_EXPIRES_MINUTES` | Minutos hasta `expiresAt` en pedidos MP (5–10080; default **30**). |
| `MP_RECONCILE_INTERVAL_MS` | Intervalo del job de reconciliación MP (default 300000 = 5 min). |
| `PEDIDO_CHECKOUT_JOBS_ENABLED` | `true` para activar jobs en desarrollo/staging; en producción activos salvo `false`. |

## Checkout abandonado (sin pago)

- `POST /api/cuenta/pedidos/:id/abandonar-checkout` (Firebase): cancela un checkout MP en `pendiente_pago` sin pago `approved`. Lo invoca el front en `/checkout/pago-resultado?mp_return=failure`.
- Job `procesarPedidosVencidos` (cada 15 min + junto al reconcile MP): cancela pedidos MP vencidos sin pago. **No** cancela pedidos con pago `approved` pendiente de confirmación (reconcile los procesa).

## Estados MP y pedido interno

| Estado MP (pago) | Acción típica en GND |
|------------------|---------------------|
| `approved` | Reclamo + `procesarPedidoConfirmado` si `pendiente_pago` |
| `pending`, `in_process`, `authorized` | Actualiza `mercadoPagoPaymentId` / `mercadoPagoStatus` |
| `rejected`, `cancelled`, `refunded`, `charged_back` | `pendiente_pago` → `fallido` |

## Probar en sandbox

1. Credenciales de prueba en `MERCADOPAGO_ACCESS_TOKEN_TEST` (o equivalente).
2. `MP_WEBHOOK_URL` apuntando a un túnel HTTPS (ngrok) **o** `NGROK_URL` + path del webhook.
3. `CHECKOUT_PUBLIC_URL` al front local (ej. `http://localhost:3002`) para volver del checkout MP.
4. En el panel MP, configurar la misma URL de webhook y copiar `MERCADOPAGO_WEBHOOK_SECRET` para validar firmas.

## Ejemplo de notificación (curl)

Sustituí `ID`, `TS`, `V1`, `REQUEST_ID` y el cuerpo según una notificación real. La firma se calcula como `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256 y el secreto de la aplicación.

```bash
curl -X POST "https://TU_HOST/api/webhooks/mercadopago?data.id=ID" \
  -H "Content-Type: application/json" \
  -H "x-signature: ts=TS,v1=V1" \
  -H "x-request-id: REQUEST_ID" \
  -d '{"type":"payment","action":"payment.updated","data":{"id":"ID"}}'
```

## Notas

- No loguear tokens ni cuerpos completos del webhook en producción.
- `X-Idempotency-Key` en `POST /checkout/preferences`: por pedido se usa `pref-pedido-<id>` para reintentos controlados del mismo alta.
- Tests: `api/tests/mp-checkout-webhook.test.ts` (firma, `data.id`, mapeo HTTP/log del handler).
