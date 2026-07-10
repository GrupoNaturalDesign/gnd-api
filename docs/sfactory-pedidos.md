# Pedidos web y SFactory — Cómo se tratan los pedidos

## Qué resuelve esta integración

La integración conecta el flujo de checkout de un ecommerce con el ERP SFactory. Cubre tres necesidades concretas:

- Estados de pedido alineados con un flujo real (pago pendiente, confirmación manual, procesamiento ERP, fallos y vencimiento).
- Reserva de stock en `ProductoWeb` al confirmar, antes de llamar a SFactory, con un flag `stockReservadoWeb` que indica si debe devolverse stock al cancelar o vencer.
- Creación de la orden en SFactory vía `ventas_crear_pedido_externo` o `ventas_crear_orden_pedido`, con trazabilidad completa en `PedidoSfactoryLog`.
- Reintentos automáticos de creación ERP y cierre de pedidos manuales vencidos.

---

## Ciclo de vida de un pedido

Los estados siguen este flujo:

```
carrito
  └─► pendiente_pago  ──────────────────────────────────────────┐
  └─► pendiente_confirmacion                                     │
            │                                                    │
            ├─► procesando ─► confirmado ─► despachado ─► entregado
            │
            ├─► fallido      (error SFactory o stock insuficiente)
            ├─► cancelado    (rechazo manual desde admin)
            └─► vencido      (expiresAt superado sin pago/confirmación)
```

La migración de base de datos convierte el valor antiguo `enviado` en `pendiente_confirmacion` automáticamente.

---

## Modelo de datos

SFactory es la fuente de verdad después de confirmar un pedido. La base local guarda
el pedido para checkout, operación administrativa, cache de estado y auditoría.

### Campo `expiresAt` en `Pedido`

Límite de tiempo para pagos pendientes en checkout web (horas desde `fechaPedido`):

- **Global:** `CHECKOUT_PEDIDO_EXPIRES_HOURS` (default **48**).
- **Overrides:** `CHECKOUT_MP_EXPIRES_HOURS`, `CHECKOUT_MANUAL_EXPIRES_HOURS`.

Ver [checkout-pedido-lifecycle.md](./checkout-pedido-lifecycle.md).

Si un pedido **ecommerce** (`usuarioId` presente) vence sin pago, el job lo marca **`cancelado`** y envía email `CANCELLED` al cliente. Pedidos cargados solo desde admin (sin `usuarioId`) pasan a **`vencido`**. Ver [checkout-pedidos-estados.md](./checkout-pedidos-estados.md).

### Campos de trazabilidad SFactory

| Campo | Uso |
|---|---|
| `sfactoryOrdenId` | ID de la orden creada en SFactory. |
| `sfactoryIntentos` | Cantidad de intentos realizados hacia la API. |
| `sfactoryError` | Último mensaje de error recibido. |
| `stockReservadoWeb` | `true` si ya se descontó `stockCache` en web. Controla si debe devolverse al cancelar. |
| `mercadoPagoPaymentId` | Único por pedido. Garantiza idempotencia en webhooks de Mercado Pago. |
| `sfactoryExternalOrderId` | ID externo enviado a SFactory (`WEB-<pedidoId>`). |
| `syncStatus` | Estado de sincronización local: `pending`, `synced`, `conflict`, `error`. |
| `syncError` | Último error de sincronización. |
| `sfactorySyncedAt` | Última sincronización exitosa contra SFactory. |
| `sfactoryLastReadAt` | Último intento de lectura remota. |
| `sfactorySnapshot` | Última respuesta leída desde SFactory para auditoría/cache. |

### `PedidoSfactoryLog`

Cada llamada relevante a SFactory (creación, reintento, marca de vencimiento) guarda: payload enviado, respuesta recibida, flag de éxito y mensaje de error. Permite auditar cualquier pedido sin depender de logs de servidor.

---

## Función central: `procesarPedidoConfirmado(pedidoId)`

Implementada en `api/src/services/pedido-checkout.service.ts`. Es el único punto de entrada para confirmar un pedido, ya venga de un pago automático (Mercado Pago) o de una aprobación manual desde el admin.

El flujo interno sigue estos pasos en orden:

**1. Idempotencia.** Si el pedido ya está en `confirmado`, `procesando`, `despachado` o `entregado`, la función termina sin error. Esto permite que un webhook de MP llegue dos veces sin duplicar órdenes.

**2. Rechazo de estados inválidos.** Si el pedido está `cancelado` o `vencido`, lanza error y no continúa.

**3. Entrada válida.** Solo procesa pedidos en `pendiente_confirmacion` o `pendiente_pago`.

**4. Stock.** Si el pedido aún no tiene `stockReservadoWeb`, verificar y reservar stock (checkout nuevo reserva al confirmar; legacy puede reservar aquí).

**5. Transacción atómica (si aplica reserva).** Estado `procesando`, `stockReservadoWeb`, decremento `stockCache`.

**6. Llamada a SFactory (solo post-pago / post-aprobación).**

- **`sfactoryOrdenId` ya existe (legacy pre-cotización):** aprobar PE con `ventas_editar_orden_pedido`.
- **Flujo actual:** `ventas_crear_pedido_externo` con precios de líneas locales + aprobar si estado cotización.

**Totales:** `subtotal` y `total` locales **no se pisan** con `response.total` de SF. Auditoría en `sfactorySnapshot._auditoria`.

**7. Éxito.** Estado → `confirmado`. Guarda `sfactoryOrdenId` y timestamps de confirmación.

**8. Fallo SFactory.** Estado → `fallido`. Incrementa `sfactoryIntentos`. Registra en `PedidoSfactoryLog`. El job de reintentos lo retomará.

---

## API de administración

Base: `/api/admin/pedidos` — requiere Firebase auth + rol admin + `empresaMiddleware`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/pendientes` | Lista pedidos en `pendiente_confirmacion`, ordenados del más viejo al más nuevo. Incluye `expiresAt`. |
| GET | `/` | Lista pedidos locales con filtros `estado`, `syncStatus`, `desde`, `hasta`, `search`, `page`, `limit`. |
| GET | `/:id` | Detalle local completo con ítems, cliente, logs SFactory y logs de envío. |
| POST | `/manual` | Crea pedido manual en `pendiente_confirmacion` con vencimiento. |
| PATCH | `/:id` | Edita datos permitidos antes de confirmar. |
| POST | `/:id/aprobar` | Ejecuta `procesarPedidoConfirmado`. |
| POST | `/:id/rechazar` | Body opcional `{ "motivo": "..." }`. Pasa el pedido a `cancelado`. Devuelve stock solo si `stockReservadoWeb` es `true`. |
| POST | `/:id/reintentar-sfactory` | Ejecuta reintento de creación SFactory para pedidos fallidos sin orden remota. |
| POST | `/:id/resolver-fallido` | Body `{ accion: "reintentar" \| "cancelar", motivo?: string }`. Reintenta o cancela liberando stock. |
| POST | `/:id/sync` | Lee la orden en SFactory y actualiza cache/estado local. |
| POST | `/sync-activos` | Sincroniza en lote pedidos activos con orden SFactory. |
| POST | `/sync-stock` | Sincroniza stock/precios desde el depósito ecommerce SFactory. |

`/api/pedidos` lista la cache local sincronizable. Los endpoints técnicos directos
contra SFactory quedan bajo `/api/sfactory/ventas/*`.

---

## Jobs automáticos

Se inician en `api/src/index.ts`. Se pueden deshabilitar con la variable `PEDIDO_CHECKOUT_JOBS_ENABLED=false`.

### Reintentos SFactory (cada 15 minutos)

Busca pedidos en estado `fallido` que cumplan estas condiciones:
- No tienen `sfactoryOrdenId` (nunca se crearon en el ERP).
- `sfactoryIntentos` está entre 1 y `SFACTORY_PEDIDO_MAX_REINTENTOS` (default 3).

No reintenta pedidos que fallaron por stock insuficiente, porque esos tienen `sfactoryIntentos` en 0.

**Aprobación ERP fallida** (cotización creada, `stockReservadoWeb` true): usar `POST /api/admin/pedidos/:id/aprobar` o `resolver-fallido` con `reintentar` — vuelve a ejecutar `procesarPedidoConfirmado` sin reservar stock otra vez.

### Vencimiento de pedidos sin pago (cada 1 hora)

Busca pedidos en `pendiente_confirmacion` o `pendiente_pago` (MP) con `expiresAt` vencido.

- **Checkout web (`usuarioId`):** `cancelado` + email `CANCELLED` + notificación admin.
- **Carga admin sin usuario:** `vencido` (sin email automático).

Devuelve stock si `stockReservadoWeb` es `true`. Ver [checkout-pedidos-estados.md](./checkout-pedidos-estados.md).

### Sync de estados SFactory

El job lee pedidos activos con `sfactoryOrdenId` y actualiza `estadoErp`,
`sfactoryEstado`, `syncStatus`, `sfactorySnapshot` y timestamps. Intervalo
configurable con `PEDIDO_SFACTORY_SYNC_INTERVAL_MS` (default: 5 minutos) y límite
por corrida con `PEDIDO_SFACTORY_SYNC_LIMIT` (default: 50).

### Sync de stock SFactory

El job reutiliza `stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce`
para actualizar `ProductoWeb.stockCache`, `precioCache` y precios derivados.
Intervalo configurable con `PEDIDO_STOCK_SYNC_INTERVAL_MS` (default: 1 hora).
Se deshabilita con `PEDIDO_STOCK_SYNC_ENABLED=false`.

### Cancelación en SFactory

Para órdenes ya creadas en SFactory, la cancelación usa
`ventas_editar_orden_pedido` cambiando el estado de la orden. El valor default es
`4` (Cancelado, comprobante PE); se puede ajustar con
`SFACTORY_ORDEN_ESTADO_CANCELADO`.

---

## Variables de entorno — mapeo ERP

Estas variables conectan el ecommerce con los IDs propios de cada tenant SFactory. Deben configurarse una vez por entorno:

| Variable | Descripción |
|---|---|
| `SFACTORY_ORDEN_MONEDA_ID` | ID de moneda (ej. 1 = ARS). |
| `SFACTORY_ORDEN_COTIZACION` | Valor de cotización. |
| `SFACTORY_ORDEN_COTIZACION_ID` | ID de la cotización en SFactory. |
| `SFACTORY_ORDEN_ORIGEN_VENTA_ID` | Origen de venta (ej. ecommerce). |
| `SFACTORY_ORDEN_SUCURSAL_ID` | Sucursal que procesa el pedido. |
| `SFACTORY_ORDEN_CENTRO_COSTO` | Centro de costo contable. |
| `SFACTORY_ORDEN_UNIDAD_NEGOCIO_ID` | Unidad de negocio. |
| `SFACTORY_ORDEN_LISTA_PRECIO_ID` | Lista de precios a usar. |
| `SFACTORY_ORDEN_UM_ID` | Unidad de medida por defecto. |
| `SFACTORY_RESERVA_DEPOSITO_ID` | Depósito ecommerce para reserva de stock. |
| `SFACTORY_ORDEN_VENTA_CONDICIONES` | String con condiciones de venta. |
| `SFACTORY_ORDEN_CONDICIONES_VENTA` | String adicional de condiciones. |
| `SFACTORY_ENTREGA_CLIENTE_DIR_ID` | Fallback de dirección de entrega si el pedido no trae ID. |
| `SFACTORY_ENTREGA_LOCALIDAD_ID` | Fallback de localidad. |
| `SFACTORY_PEDIDO_MAX_REINTENTOS` | Máximo de reintentos (default: 3). |
| `SFACTORY_ORDEN_ESTADO_APROBADO` | Estado PE al confirmar (default: `2`). |
| `SFACTORY_ORDEN_ESTADO_CANCELADO` | Estado PE al cancelar/anular (default: `4`). |
| `SFACTORY_ORDEN_ESTADO_COTIZACION` | Referencia cotización (default: `1`; solo lectura/sync). |
| `PEDIDO_SFACTORY_SYNC_INTERVAL_MS` | Intervalo del job de sync de pedidos (default: 300000). |
| `PEDIDO_SFACTORY_SYNC_LIMIT` | Cantidad máxima de pedidos activos a leer por corrida (default: 50). |
| `PEDIDO_STOCK_SYNC_INTERVAL_MS` | Intervalo del job de sync de stock (default: 3600000). |
| `PEDIDO_STOCK_SYNC_ENABLED` | `false` deshabilita el job de stock. |
| `SFACTORY_EMPRESA_ID_LISTADO` | Para el endpoint GET `/api/pedidos` si no se pasa por query. |
| `SFACTORY_COMERCIAL_ID_LISTADO` | Comercial para listado admin. |
| `CHECKOUT_MANUAL_EXPIRES_DAYS` | Días para acreditar transferencia/efectivo en checkout web (default: 10). |
| `CHECKOUT_MP_EXPIRES_MINUTES` | Minutos de validez del checkout MP en `pendiente_pago` (default: 120). |

---

## Endpoint externo: `ventas_crear_pedido_externo`

Este endpoint es el puente principal entre el ecommerce y SFactory. Permite crear una orden sin conocer los IDs internos del ERP, resolviendo cliente e ítems automáticamente.

### Resolución del cliente

El sistema busca en este orden:
1. Por `cuit` (11 dígitos, sin guiones) entre clientes activos.
2. Si no encuentra, busca por `email`.
3. Si no existe ninguna coincidencia, crea un cliente nuevo. En ese caso `cliente.nombre` es obligatorio.

Se requiere enviar al menos uno de `cliente.cuit` o `cliente.email`.

### Resolución de ítems

Cada ítem se resuelve por `sku` (equivale al campo `codigo` en SFactory). El ítem debe estar activo. Los totales (neto, IVA, total) los calcula el servidor, no hace falta enviarlos.

### Parámetros de negocio

Comercial, moneda, sucursal y demás valores se toman de la configuración del `source` en SFactory. El administrador de SFactory debe tener una fila activa en `external_orders_config` para el `source` que se envíe (ej. `"chatbot"`, `"ecommerce"`).

---

## Soporte de stock: `inventory_stock_items_by_warehouse_v2`

### Qué funciona

- `lista_depositos`: devuelve correctamente todos los depósitos disponibles.
- Consulta por ítems puntuales: con `warehouse_id`, `field` y `items` el endpoint responde `success: true`. En algunos casos devuelve `data: []` si el ítem no tiene stock en ese depósito.

### Qué no funciona aún

La consulta con `all_items: true` (para obtener todo el stock de un depósito sin listar SKUs) devuelve error:

```json
{
  "result": {
    "success": false,
    "state": 900,
    "message": {
      "title": "[stock_items_by_warehouse_v2]: [Validacion de datos]: No se ha enviado items para consultar existencias."
    }
  }
}
```

La validación del servidor ignora `all_items: true` y exige igualmente el array `items`. Se requiere que el administrador de SFactory habilite o documente el request correcto para este caso de uso.

---

## Emails al cliente

`pedido-email-notification.service.ts` envía `OrderStatusEmail` en:

- Confirmación (`CONFIRMED`) tras `procesarPedidoConfirmado`.
- Cancelación admin o vencimiento ecommerce (`CANCELLED`).

El pedido recibido sin pago (`PENDING`) sigue saliendo del checkout vía `POST /emails/order-confirmation`.

## Fuera de alcance actual

- Seguimiento de envío físico más allá de los campos ya presentes en `Pedido` (email de tracking post-carrier).
