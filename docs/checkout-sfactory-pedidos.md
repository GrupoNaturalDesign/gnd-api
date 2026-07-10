# Checkout web → S-Factory → Mercado Pago → aprobación PE

> **Obsoleto.** Este documento describe el flujo de **pre-cotización S-Factory** (PE creada al confirmar pedido).  
> El flujo actual está en **[checkout-pedido-lifecycle.md](./checkout-pedido-lifecycle.md)** (S-Factory solo post-pago, reserva stock en web, precios locales).

## Objetivo (histórico)

Documentar el encadenamiento **pedido local → cotización S-Factory → cobro MP → aprobación PE** para que cambios en un punto no rompan el resto.

## Regla de totales

| Concepto | Fuente |
|----------|--------|
| Subtotal productos | `response.total` de `ventas_crear_pedido_externo` (lista de precios ERP, IVA, descuentos cupón vía payload) |
| Envío postal | `costoEnvio` validado en GND (`clientQuotedAmount` / cotización Andreani o Correo) — **no** va en el PE de S-Factory |
| **Total a cobrar** | `subtotal ERP + costoEnvio` |

El envío se muestra como línea aparte en la preferencia Mercado Pago y en el detalle admin del pedido.

## Flujo resumido (Mercado Pago)

1. **Crear pedido local** — `api/src/services/mp-checkout.service.ts` (`crearPedidoMp`):
   - Inserta `Pedido` (`pendiente_pago`), líneas con SKUs/`sfactoryItemId`, snapshot de envío, cupón si aplica.
   - `ext_order_id` futuro: `WEB-<id>`.

2. **Cotizar en S-Factory (pre-pago)** — `registrarCotizacionSfactoryParaPedido` en `pedido-checkout.service.ts`:
   - Llama `ventas_crear_pedido_externo` con `buildPedidoExternoParams`.
   - Persiste `sfactoryOrdenId`, `sfactorySnapshot`, `subtotal` (= `response.total`), `total` (= ERP + envío).
   - Si falla → pedido `fallido`, no se crea preferencia MP.

3. **Preferencia Mercado Pago** — mismo `crearPedidoMp`:
   - Líneas agregadas: **productos (total ERP)** + **envío** (si > 0).
   - Sin línea negativa de cupón (el descuento ya está en el total ERP si se envió en el payload).
   - `external_reference: pedido_<id>`, `mpPreferenceId` persistido.

4. **Webhook MP** — `procesarWebhookMp`:
   - Valida monto: `pedido.total` cuando ya existe `sfactoryOrdenId` (no resta `descuento` otra vez).
   - Si `approved` → `procesarPedidoConfirmado(pedidoId)`.

5. **Confirmación post-pago** — `procesarPedidoConfirmado`:
   - Reserva stock web (igual que antes).
   - Si **`sfactoryOrdenId` ya existe** (flujo nuevo): `ventas_leer_orden_pedido` + `ventas_editar_orden_pedido` con `estado` = `SFACTORY_ORDEN_ESTADO_APROBADO` (default `2`) — **no** recrea el PE.
   - Si no hay orden remota (legacy / admin manual antiguo): crea PE en confirmación como antes.
   - Email `CONFIRMED`, registro de uso de cupón.

## Flujo transferencia / efectivo (checkout web)

`crearPedidoManual` también cotiza en S-Factory al crear (`registrarCotizacionSfactoryParaPedido`). El pedido queda en `pendiente_confirmacion` con totales ERP + envío. Al aprobar desde admin, `procesarPedidoConfirmado` aprueba la PE existente.

## Puntos de atención

- `SFACTORY_PEDIDO_EXTERNO_SOURCE` debe coincidir con `external_orders_config` en S-Factory.
- Pedidos **legacy** sin `sfactoryOrdenId` al confirmar siguen usando creación PE en `procesarPedidoConfirmado`.
- Envío Andreani/Correo: cotización y snapshot en checkout; el monto de envío no se envía como ítem al ERP.
- Reintentos job (`reintentarFallidosSfactory`): solo pedidos `fallido` **sin** `sfactoryOrdenId`.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `mp-checkout.service.ts` | Pedido local → cotización SF → preferencia MP, webhook |
| `pedido-checkout.service.ts` | `registrarCotizacionSfactoryParaPedido`, stock, `procesarPedidoConfirmado`, aprobación PE |
| `utils/sfactory-pedido-response.util.ts` | Parseo de `response.total`, id, estado |
| `sfactory/sfactory-orden-pedido.service.ts` | Leer + editar estado PE (aprobar/cancelar) |
| `sfactory/sfactory.service.ts` | `crearPedidoExterno`, `editarOrdenPedido`, `leerOrdenPedido` |
| `controllers/checkout.controller.ts` | Entradas HTTP del checkout |

## Respuesta API `POST /checkout/mp`

Además de `pedidoId`, `checkoutUrl`, `preferenceId`, puede incluir:

- `subtotalProductos` — total ERP
- `costoEnvio` — envío validado
- `totalCobro` — suma final cobrada en MP
