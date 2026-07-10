# Checkout web — ciclo de vida unificado (stock, precios, S-Factory post-pago)

Documento de referencia del flujo actualizado del checkout ecommerce GND.

**Reemplaza** el modelo de pre-cotización S-Factory descrito en [checkout-sfactory-pedidos.md](./checkout-sfactory-pedidos.md) (obsoleto).

---

## Principios

1. **Un solo pipeline** para Mercado Pago, transferencia y efectivo.
2. **S-Factory solo post-pago / post-aprobación admin** — no al pulsar "Confirmar pedido" en la web.
3. **Reserva de stock en web** al confirmar pedido (`stockReservadoWeb`), liberada al vencer o cancelar.
4. **Precios web = fuente de verdad** para cobro (MP), persistencia (`Pedido`/`PedidoItem`) y payload a S-Factory.
5. **`response.total` de S-Factory** — solo auditoría en `sfactorySnapshot._auditoria`; no pisa `pedidos.subtotal` ni `pedidos.total`.

---

## Modos de precio

Espejo server/cliente de `client/src/app/utils/checkoutPricing.ts`.

| Medio de pago | Modo | Precio unitario esperado |
|---------------|------|--------------------------|
| MP `financiado` | `lista` | `producto_precios.precioLista` (minorista) |
| MP `transfer` | `transfer` | `producto_precios.precioTransfer` (fallback lista) |
| Transferencia bancaria | `transfer` | igual que MP transfer |
| Efectivo | `transfer` | igual que MP transfer |

Validación en servidor: `validateItemPricesForCheckout` (`checkout-pedido-lifecycle.service.ts`).

---

## Totales del pedido

| Concepto | Fuente |
|----------|--------|
| Subtotal productos | Suma de `pedido_items.precio_unitario × cantidad` (validados en servidor) |
| Descuento cupón | `cuponDescuentoTotal` / snapshot de cupón |
| Envío | `costoEnvio` validado en checkout (Andreani/Correo) — no va como ítem en el PE |
| **Total a cobrar** | `subtotal − descuento + costoEnvio` (o subtotal neto + envío según implementación de cupón) |

Mercado Pago cobra ese total local. S-Factory recibe líneas con `precio: precioUnitario` por ítem en `buildPedidoExternoParams`.

---

## Ciclo de vida (estados)

```
Confirmar pedido (web)
  → pendiente_pago (MP) | pendiente_confirmacion (transfer/efectivo)
  → reserva stock web (stockReservadoWeb = true)
  → expiresAt = fechaPedido + N horas

Pago MP approved | Admin aprueba
  → procesarPedidoConfirmado
  → procesando (transitorio si aún no reservó)
  → ventas_crear_pedido_externo
  → ventas_editar_orden_pedido (estado 2 si PE en cotización)
  → confirmado

Sin pago antes de expiresAt (ecommerce)
  → cancelado + devolución stock + email CANCELLED

Error S-Factory post-pago
  → fallido (reintento job si aplica)
```

---

## Secuencia por forma de pago

### Mercado Pago

1. `POST /api/checkout/mp` → `crearPedidoMp` → `crearPedidoCheckout` + preferencia MP.
2. Cliente paga en MP.
3. Webhook `approved` → `procesarPedidoConfirmado` → creación PE en S-Factory.

### Transferencia / efectivo

1. `POST /api/checkout/manual` → `crearPedidoManual` → `crearPedidoCheckout`.
2. Email instrucciones de pago (`expiresAt` en copy).
3. Admin `POST /api/admin/pedidos/:id/aprobar` → `procesarPedidoConfirmado`.

---

## S-Factory — endpoints y timing

| Momento | Endpoint | Notas |
|---------|----------|-------|
| Post-pago / post-aprobación | `ventas_crear_pedido_externo` | `ext_order_id`: `WEB-<pedidoId>` |
| PE en cotización (`1`) | `ventas_leer_orden_pedido` + `ventas_editar_orden_pedido` | Estado `SFACTORY_ORDEN_ESTADO_APROBADO` (default `2`) |
| Vencimiento sin pago (flujo nuevo) | — | No hay PE; solo liberar stock local |
| Pedidos legacy con PE cotización impaga | `ventas_editar_orden_pedido` cancelado | `cancelarCotizacionSfactoryImpaga` en job vencimiento |

`registrarCotizacionSfactoryParaPedido` queda **deprecada** (pre-pago).

---

## Reserva de stock

- Al confirmar pedido: `reservarStockPedidoWeb(pedidoId)` decrementa `producto_web.stock_cache`.
- Flag `pedidos.stock_reservado_web` controla devolución en cancelación/vencimiento.
- Sync desde S-Factory: `stockCache = max(0, stockSF − reservasActivas)` por SKU (`stock-reservas.util.ts`).

Estados con reserva activa: `pendiente_pago`, `pendiente_confirmacion`, `procesando`, `fallido` (con `stockReservadoWeb = true`).

---

## Vencimiento (`expiresAt`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `CHECKOUT_PEDIDO_EXPIRES_HOURS` | `48` | Plazo global (horas desde `fechaPedido`) |
| `CHECKOUT_MP_EXPIRES_HOURS` | override opcional MP | |
| `CHECKOUT_MANUAL_EXPIRES_HOURS` | override opcional transfer/efectivo | |
| `CHECKOUT_EXPIRY_WARNING_HOURS` | `12` | Ventana para alerta "próximos a vencer" |
| `CHECKOUT_SF_PRICE_AUDIT_TOLERANCE` | `0.05` | Tolerancia ARS auditoría SF vs local |

Deprecado: `CHECKOUT_MP_EXPIRES_MINUTES` (fallback si no hay `CHECKOUT_MP_EXPIRES_HOURS`).

Job `procesarPedidosVencidos` (cada 1 h): cierra pedidos con `expiresAt < now`.

Job `avisarPedidosProximosAVencer`: notificación admin `pedido.expiring_soon` y email al cliente (`order_expiring_soon`, dedupe 24 h).

`GET /api/checkout/config-tienda` expone `pagoManualHorasPlazo`, `mpExpiresHours`, `defaultExpiresHours` y `expiryWarningHours` para copy en checkout.

**Manual + envío postal:** checkout guarda snapshot y reserva stock; S-Factory y carrier solo tras aprobación admin (`procesarPedidoConfirmado`). Ver test `manual-shipping-lifecycle.test.ts` y QA caso 1b.

---

## Auditoría de precios S-Factory

Tras `ventas_crear_pedido_externo`, en `sfactorySnapshot`:

```json
{
  "...respuesta SF...",
  "_auditoria": {
    "sfTotalProductos": 12345.67,
    "localSubtotal": 12345.70,
    "delta": -0.03,
    "priceMode": "transfer",
    "formaPago": "transferencia"
  }
}
```

Si `|delta| > CHECKOUT_SF_PRICE_AUDIT_TOLERANCE` → notificación admin `pedido.price_divergence` (no bloquea el pedido).

---

## Notificaciones admin

| Tipo | Cuándo |
|------|--------|
| `pedido.created` | Pedido MP creado |
| `pedido.confirmation_required` | Manual pendiente admin |
| `pedido.payment_approved` | MP approved |
| `pedido.status_changed` | Confirmado en SF |
| `pedido.sync_failed` | Error SF / stock |
| `pedido.cancelled` | Rechazo o vencimiento |
| `pedido.expiring_soon` | `expiresAt` dentro de ventana warning |
| `pedido.price_divergence` | Delta auditoría SF fuera de tolerancia |

Dashboard `GET /api/admin/dashboard/alertas`: incluye `proximosAVencer`, `pendientesConfirmacion`, `sfactoryIssues`, `pagoPendienteAntiguo`.

---

## Migración desde pre-cotización

Pedidos creados antes del deploy pueden tener `sfactoryOrdenId` en cotización sin pago:

- Al vencer: `cancelarCotizacionSfactoryImpaga` sigue activo.
- Al pagar/aprobar: si ya hay `sfactoryOrdenId`, `procesarPedidoConfirmado` aprueba la PE existente (sin recrear).

Pedidos nuevos no tienen `sfactoryOrdenId` hasta post-pago.

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `checkout-pedido-lifecycle.service.ts` | Pipeline unificado, precios, reserva stock |
| `checkout-expires.config.ts` | `expiresAt` en horas |
| `mp-checkout.service.ts` | Adaptadores MP / manual web |
| `pedido-checkout.service.ts` | `procesarPedidoConfirmado`, vencimiento, rechazo |
| `sync/stock-reservas.util.ts` | Reservas activas por SKU |
| `sync/stock-precios-sync.service.ts` | Sync SF respetando reservas |
| `sfactory/sfactory-orden-pedido.service.ts` | Aprobar / cancelar PE |
| `dashboard.service.ts` | Alertas operativas |

Ver también: [checkout-pedidos-estados.md](./checkout-pedidos-estados.md), [sfactory-pedidos.md](./sfactory-pedidos.md).
