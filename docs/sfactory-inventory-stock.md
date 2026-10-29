# S-Factory — sincronización de inventario

## Recurso periódico

La tienda sincroniza stock y precios con `module: "inventario"` y
`method: "inventory_stock_items_changed_since"`.

Primera carga, una sola vez por empresa/depósito:

```json
"parameters": { "warehouse_id": 52624, "all_items": true }
```

Ejecuciones posteriores:

```json
"parameters": {
  "warehouse_id": 52624,
  "changed_since": "2026-10-28 15:00:00"
}
```

El cursor queda persistido en `sfactory_inventory_sync_state`. Se envía con dos
minutos de solapamiento para no perder cambios en el borde del segundo y solo se
avanza después de aplicar correctamente la respuesta. Los upserts toleran filas
repetidas.

El snapshot local queda en `sfactory_inventory_items`. La sincronización de
catálogo, el filtrado por depósito y la purga leen esa tabla; no vuelven a pedir
todo el inventario remoto.

Un delta vacío significa que no hubo cambios. Los códigos ausentes del delta no
se modifican. Solo en la carga inicial se considera que una variante local ausente
del snapshot debe quedar sin stock/inactiva.

## Consultas puntuales

`inventory_stock_items_by_warehouse_v2` queda reservado para los códigos de un
pedido, un producto editado o las variantes de un único grupo:

```json
"parameters": {
  "warehouse_id": 52624,
  "all_items": false,
  "field": "code",
  "items": ["L-WW-CAM-WR4", "L-WW-CAM-WR5"]
}
```

Todos los códigos se envían juntos. El código rechaza más de 80 para impedir que
una consulta puntual vuelva a convertirse accidentalmente en un barrido masivo.

No usar `all_items: true` con `inventory_stock_items_by_warehouse_v2`: esa
combinación fue rechazada por la API y no es el recurso de sincronización.

## Operación

- Job: `PEDIDO_STOCK_SYNC_ENABLED` y `PEDIDO_STOCK_SYNC_INTERVAL_MS`.
- El siguiente ciclo se programa al terminar el anterior.
- Un lease persistente por empresa/depósito evita ejecuciones simultáneas.
- Migración: `migrations/add_sfactory_inventory_delta_sync.sql`.
- Ante un error, se registra `last_error` y el cursor no avanza.
