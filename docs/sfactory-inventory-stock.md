# S-Factory — `inventory_stock_items_by_warehouse_v2`

**Endpoint:** `POST https://sfactory-api.com.ar/sfactory/api/main`  
**Servicio:** `module: "inventario"`, `method: "inventory_stock_items_by_warehouse_v2"`

---

## Lo que sí funciona

**1. `lista_depositos`** — Responde bien y devuelve los depósitos (ids 1, 2, 3, 3077, 3078, 3079, 12993, 52624, etc.).

**2. Consulta por ítems puntuales** — Con `warehouse_id`, `field` y `items` el método responde `success: true`, pero a veces con `data: []`:

```json
"parameters": {
  "warehouse_id": 12993,
  "all_items": false,
  "field": "code",
  "items": ["L-WW-CAM-WR4"]
}
```

Response: `result.success: true`, `response.data: []`.

---

## Lo que no funciona

**Consultar todos los ítems del depósito** (`all_items: true`). Probado con varios depósitos (ej. ECOMMERCE 52624, COTIZACIÓN 12993):

```json
"parameters": {
  "warehouse_id": 12993,
  "all_items": true
}
```

Response:

```json
"result": {
  "success": false,
  "state": 900,
  "message": {
    "title": "[stock_items_by_warehouse_v2]: [Validacion de datos]: No se ha enviado items para consultar existencias."
  }
}
```

---

## Solicitud a soporte S-Factory

Necesitamos poder usar **`all_items: true`** para obtener el stock de todos los ítems de un depósito sin enviar la lista en `items`. ¿Podrían indicar el request exacto (incluyendo nombres de parámetros) que debemos enviar para este caso, o habilitar/ajustar la validación de `all_items` en el endpoint?

---

*Documento movido desde la raíz del monorepo (`sfactory-depositos.md`) para mantener una sola fuente bajo `api/docs/`.*
