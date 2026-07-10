# API — notas de integración

## Checkout → SFactory (pedido externo)

Tras pago aprobado (Mercado Pago) o aprobación admin, el backend confirma stock y crea el pedido en SFactory con **`ventas_crear_pedido_externo`**.

- **`SFACTORY_PEDIDO_EXTERNO_SOURCE`**: debe coincidir con un `source` activo en `external_orders_config` en SFactory (configuración admin).
- **Cliente**: SFactory resuelve por CUIT (11 dígitos) o email; si el pedido local no tiene `Cliente` vinculado, se usan `clienteEmail` / `clienteNombre` del snapshot del pedido (p. ej. checkout MP).
- **Ítems**: se envían por **SKU** (`pedidos_items.codigo`). No se envían `descuento` ni `iva` por línea en el flujo web: precios y alícuotas los define SFactory según el ítem y listas.
- **Entrega**: si hay dirección y CP en el pedido, se arma el bloque `entrega` usando `SFACTORY_ENTREGA_PROVINCIA_DEFAULT` y `SFACTORY_ENTREGA_LOCALIDAD_DEFAULT`.

Variables relacionadas: ver `.env.example`.

## Endpoint de prueba (admin)

`POST /api/sfactory/ventas/pedido-externo`

- Autenticación: Firebase + rol admin (igual que el resto de `/sfactory/ventas`).
- Body JSON validado con Zod: `source`, `ext_order_id`, `cliente` (cuit 11 dígitos o email), `items` (mínimo 1 con `sku`, `cantidad`).
- Opcional: `descuento` (0–100 %), `iva` en ítems solo para pruebas manuales; el checkout web no los envía.

Consultar `src/validation/sfactory-pedido-externo.schema.ts` para la forma exacta del body.

## Legacy

`POST /api/sfactory/ventas/ordenes-pedido` sigue llamando a `ventas_crear_orden_pedido` (IDs internos y totales manuales); no es el flujo del ecommerce.
