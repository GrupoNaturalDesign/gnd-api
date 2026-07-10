# Checkout web — estados, vencimiento y emails

## Principio

- **SFactory solo recibe pedidos pagados/confirmados** (`procesarPedidoConfirmado`).
- El checkout web crea el pedido en MySQL; la orden ERP se crea cuando hay pago acreditado (MP) o aprobación admin (transferencia/efectivo).

## Estados locales (`estadoInterno`)

| Estado | Cuándo |
|--------|--------|
| `pendiente_pago` | Checkout Mercado Pago, esperando pago |
| `pendiente_confirmacion` | Checkout transferencia/efectivo, esperando acreditación |
| `procesando` | Transitorio: reservando stock y llamando SFactory |
| `confirmado` | Orden creada en SFactory (`sfactoryOrdenId` si la API devolvió id) |
| `fallido` | Sin stock o error SFactory |
| `cancelado` | Rechazo admin o **vencimiento ecommerce sin pago** |
| `vencido` | Solo pedidos **no ecommerce** (carga admin) que expiraron sin confirmar |
| `despachado` / `entregado` | Sync desde SFactory (post-pago) |

## Ecommerce vs admin

Un pedido es **checkout ecommerce** si tiene `usuarioId` (sesión Firebase del checkout).

| Origen | `usuarioId` | Vencimiento sin pago |
|--------|-------------|----------------------|
| Checkout web | Sí | `cancelado` + email `CANCELLED` |
| Admin `POST /admin/pedidos/manual` | No* | `vencido` (sin email automático) |

\*Salvo que en el futuro el admin asocie usuario.

## Plazos (`expiresAt`)

| Forma de pago | Variable | Default |
|---------------|----------|---------|
| Todos (global) | `CHECKOUT_PEDIDO_EXPIRES_HOURS` | **48** horas |
| Mercado Pago (override) | `CHECKOUT_MP_EXPIRES_HOURS` | hereda global |
| Transferencia / efectivo (override) | `CHECKOUT_MANUAL_EXPIRES_HOURS` | hereda global |
| Aviso próximo vencimiento | `CHECKOUT_EXPIRY_WARNING_HOURS` | **12** horas |

Deprecado: `CHECKOUT_MP_EXPIRES_MINUTES`, `CHECKOUT_MANUAL_EXPIRES_DAYS`.

Job `procesarPedidosVencidos` (cada 1 h, si `PEDIDO_CHECKOUT_JOBS_ENABLED=true`):

1. Busca `expiresAt < now` y estado `pendiente_confirmacion` o `pendiente_pago` (MP).
2. Si es ecommerce → `cancelado`, notificación admin, email al cliente.
3. Si no es ecommerce → `vencido` (comportamiento anterior).

## Emails al cliente (`OrderStatus`)

| Evento | Estado email | Disparador |
|--------|--------------|------------|
| Pedido recibido (sin pago aún) | `PENDING` | Front → `POST /emails/order-confirmation` (transferencia/efectivo) |
| Pago acreditado / admin aprueba / MP approved | `CONFIRMED` | `procesarPedidoConfirmado` → `sendPedidoStatusEmailAsync` |
| Cancelación admin o vencimiento sin pago | `CANCELLED` | `rechazarPedido`, `pedidoSyncService.cancelar`, job vencimiento ecommerce |
| Cambio logístico desde ERP | `IN_PROCESS`, `SHIPPED`, etc. | `POST` ERP `order-status` (existente) |

Servicio: `api/src/services/pedido-email-notification.service.ts`.

Copia interna (`RESEND_INTERNAL_TO`) en confirmación y cancelación.

## Códigos PE SFactory (Orden Pedido)

Tabla de referencia del tenant (comprobante PE). Mapper: `mapRemoteOrderStatus` en `pedido-sync.service.ts`.

| Código | Nombre PE | `OrderStatus` (email/sync) | `estadoInterno` típico (sync) |
|--------|-----------|----------------------------|--------------------------------|
| 1 | Cotización | `PENDING` | — |
| 2 | Aprobado | `CONFIRMED` | `confirmado` |
| 3 | Terminado | `DELIVERED` | `entregado` |
| 4 | Cancelado | `CANCELLED` | `cancelado` |
| 5 | En curso | `IN_PROCESS` | `procesando` |
| 6 | A entregar | `SHIPPED` | `despachado` |
| 11 | Cerrado | `DELIVERED` | `entregado` |
| 12 | Cotización perdida | `CANCELLED` | `cancelado` |

Cancelación remota: `SFACTORY_ORDEN_ESTADO_CANCELADO` (default `4`).

## Flujo resumido

```
Checkout transferencia/efectivo
  → pendiente_confirmacion (+48h default)
  → reserva stock web
  → Admin aprueba
  → procesarPedidoConfirmado → SFactory + CONFIRMED email

Checkout MP
  → pendiente_pago (+48h default)
  → reserva stock web
  → Webhook approved → procesarPedidoConfirmado → SFactory + CONFIRMED email

Sin pago (ecommerce, expiresAt)
  → cancelado + devolución stock + CANCELLED email
```

## Archivos

| Archivo | Rol |
|---------|-----|
| `mp-checkout.service.ts` | Crear pedido MP/manual, webhook |
| `pedido-checkout.service.ts` | Confirmación, vencimiento, rechazo |
| `pedido-email-notification.service.ts` | Emails de estado |
| `pedido-sync.service.ts` | Mapper PE, cancelar admin, sync |
| `pedido-checkout.jobs.ts` | Jobs vencimiento / reintentos |

Ver también: [checkout-pedido-lifecycle.md](./checkout-pedido-lifecycle.md), [sfactory-pedidos.md](./sfactory-pedidos.md), [emails.md](./emails.md).
