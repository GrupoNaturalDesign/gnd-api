# Sync optimizado con S-Factory

Resumen de cómo funcionan las sincronizaciones después de la optimización por hash/diff (sin migración de BD).

## Endpoints

| Ruta | Uso recomendado |
|------|-----------------|
| `POST /api/sync/productos` | Catálogo completo (admin). Paso 1 trae `items_list`; filtra por depósito ecommerce **por código** (no arrastra el grupo entero). Al finalizar ejecuta stock/precios + alineación de `activoSfactory`. |
| `POST /api/sync/stock-precios` | Stock, precios y `activoSfactory` desde depósito ecommerce (`inventory_stock_items_by_warehouse_v2`). Frecuente (botón admin o job horario). |
| `POST /api/clientes/sync` | Import masivo de clientes. Diff por hash; lock + cooldown 10 min. |
| Job `syncPedidosActivosDesdeSfactory` | Poll de pedidos activos; skip si `sfactoryLastPayloadHash` no cambió. |

## Stats en respuestas

### Productos (`data` del controller)

- `syncSfactory.omitidos` — SKUs sin cambios en paso 1 (no upsert).
- `syncSfactory.codigosAfectados` — Set serializado en logs; tamaño indica cuántos grupos pueden reprocesarse.
- `procesamiento.gruposProcesados` / `gruposOmitidos` — Grupos tocados vs total catálogo.
- `procesamiento.productosWebOmitidos` — Variantes sin write en paso 2.

### Stock/precios

- `variantesOmitidas` — Mismo stock y precio que cache local.
- `preciosActualizados` — Upserts en `producto_precio` por cambio de `sale_price`.
- `variantesDesactivadas` / `variantesActivadas` — Ajuste de `activoSfactory` según stock o `sale_price` en depósito (por SKU; marcadores `_D/_H/_U` requieren precio en depósito).
- `padresDespublicados` — Solo si `SYNC_DESPUBLICAR_PADRES_SIN_VENDIBLES=true`.

### Clientes

- `omitidos`, `insertados`, `actualizados`, `exitosos`, `fallidos`.

### Pedidos (job / admin)

- `omitidos` — Lecturas sin cambio de payload en S-Factory.

## Variables de entorno

| Variable | Recomendación |
|----------|----------------|
| `SFACTORY_WAREHOUSE_ID_ECOM` | Depósito ecommerce (ej. `52624`). Obligatorio para filtro de catálogo y stock. |
| `SYNC_DESPUBLICAR_PADRES_SIN_VENDIBLES` | `false` por defecto; `true` solo si querés despublicar padres sin variantes con stock y precio > 0. |
| `SYNC_STOCK_AFTER_PRODUCTOS` | **Obsoleto** — `POST /api/sync/productos` y `/all` siempre encadenan stock/precios al final. |
| `PEDIDO_STOCK_SYNC_ENABLED` | `true` en producción. |
| `PEDIDO_SFACTORY_SYNC_LIMIT` | `50` (default). |
| `DB_WRITE_CONCURRENCY` | Ajustar según pool MySQL. |

## Agrupación por sublínea en descripción

Si varios SKUs comparten prefijo (`L-WW-ACC-DEL2` … `DEL4`) pero la descripción de S-Factory incluye **Denim** o **Gabardina** como parte del nombre del artículo, el sync crea **padres distintos**:

| Descripción SF | `codigo_agrupacion` |
|----------------|---------------------|
| Delantal Chill … (sin Denim/Gabardina) | `L-WW-ACC-DEL_U` |
| Delantal Chill **Denim** … | `L-WW-ACC-DEL-DENIM_U` |
| Delantal Chill **Gabardina** … | `L-WW-ACC-DEL-GABARDINA_U` |

Tras el primer sync, conviene reasignar variantes en BD si quedó un padre legacy mezclado; el sync no vuelve a fusionar Chill + Denim.

El paso 2 detecta **desalineación** (variante en `productos_web` con `codigo_agrupacion` distinto al canónico actual) y reprocesa ambos padres aunque SF no haya cambiado. `resolveGruposAfectados` incluye agrupación nueva + padre legacy.

### Colores y publicación de padres (post-sync)

- `colores_disponibles` se recalcula **solo** con variantes `activo_sfactory = true` (consolida AZUL MARINO vs AZUL suelto).
- Padres **sublínea** (`-DENIM_`, `-GABARDINA_`): al crearse se publican si el padre base ya está publicado (`publicarPadresSublineaAlineados`).
- Tras productos y tras stock/precios se ejecuta el refresco de colores en todos los padres ecommerce.

Script manual: `npx ts-node --transpile-only scripts/refrescar-colores-padre.ts 1 [codigo_agrupacion...]`

## Checklist QA manual

1. Sync productos sin cambios en SF → alto `omitidos`, catálogo igual.
2. Editar 1 SKU en SF → solo su grupo en paso 2.
3. SKU sin stock ni precio en depósito ecommerce → `activoSfactory=false` en web (aunque otra variante del mismo grupo sí tenga stock).
4. Dar de baja SKU en SF → deja de entrar en paso 1; purge de stock lo desactiva en web.
5. Sync stock 2 veces → segunda con `variantesOmitidas ≈ total`.
6. Pedido activo sin cambio → job incrementa `omitidos`, sin logs nuevos rutinarios.
7. Clientes sync 2 veces → segunda mayoría `omitidos`.
8. Cooldown productos/clientes → 429 antes de 10 min.
9. Crear/editar producto admin → `syncProductoIncremental` sigue OK.

## Limitaciones conocidas

- `items_list` sigue trayendo todo el catálogo S-Factory (limitación API).
- `inventory_stock_items_by_warehouse_v2` no soporta `all_items: true` — ver [sfactory-inventory-stock.md](./sfactory-inventory-stock.md).
- El filtro de depósito es **por código** (`resolverCodigosPermitidosDeposito`); un padre puede procesarse si al menos una variante es vendible en el depósito, pero las demás quedan con `activoSfactory=false`.
- SKUs marcadores `_D/_H/_U` solo se activan si tienen `sale_price` en el depósito ecommerce.
- Variantes **sin color** en padres **sin** whitelist de colores: siguen activas si el depósito las considera vendibles (`activoSfactoryConWhitelist`). Padres con whitelist siguen exigiendo color permitido/aprobado.

## Código

- Hashes: `api/src/utils/sync-hash.utils.ts`
- Productos: `api/src/services/sync/producto-sync.service.ts`
- Stock / activo depósito: `api/src/services/sync/stock-precios-sync.service.ts`
- Inventario depósito: `api/src/utils/sfactory-stock-fetch.utils.ts` (`obtenerInventarioPorCodigos`, `resolverCodigosPermitidosDeposito`)
- Colores por padre (NTDS): `api/src/config/colores-padre-whitelist.config.ts` + `api/src/utils/sfactory-color-parse.utils.ts` (patrones `GRIS MEL CL`, `RAY CEL`, etc.)
- Pedidos: `api/src/services/pedido-sync.service.ts`
- Clientes: `api/src/services/clientes.service.ts`
