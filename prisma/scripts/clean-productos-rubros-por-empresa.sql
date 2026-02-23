-- =============================================================================
-- Limpieza total: productos, rubros y subrubros por empresa
-- Orden respeta FKs. Tras ejecutar, correr sync: rubros -> subrubros -> productos
-- =============================================================================
-- Uso: Cambiar @empresa_id y ejecutar en MySQL.
--      Por defecto empresa_id = 1
-- =============================================================================

SET @empresa_id = 1;

-- Deshabilitar verificación de FKs solo durante el script (opcional, más rápido)
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Items de pedidos que referencian productos de esta empresa
DELETE pi FROM pedidos_items pi
INNER JOIN productos_web pw ON pi.producto_web_id = pw.id
WHERE pw.empresa_id = @empresa_id;

DELETE pi FROM pedidos_items pi
INNER JOIN productos_padre pp ON pi.producto_padre_id = pp.id
WHERE pp.empresa_id = @empresa_id;

-- 2. Precios de productos (productos_web)
DELETE pp FROM productos_precios pp
INNER JOIN productos_web pw ON pp.producto_web_id = pw.id
WHERE pw.empresa_id = @empresa_id;

-- 3. Imágenes de productos (productos_web)
DELETE pi FROM producto_imagenes pi
INNER JOIN productos_web pw ON pi.producto_web_id = pw.id
WHERE pw.empresa_id = @empresa_id;

-- 4. Variantes de producto
DELETE FROM productos_web WHERE empresa_id = @empresa_id;

-- 5. Productos padre (agrupaciones)
DELETE FROM productos_padre WHERE empresa_id = @empresa_id;

-- 6. Tabla sincronizada desde SFactory
DELETE FROM productos_sfactory WHERE empresa_id = @empresa_id;

-- 7. Quitar referencias de reglas de parseo a rubros/subrubros para poder borrarlos
UPDATE reglas_parseo
SET aplicar_a_rubro_id = NULL, aplicar_a_subrubro_id = NULL
WHERE empresa_id = @empresa_id;

-- 8. Subrubros (dependen de rubros)
DELETE FROM subrubros WHERE empresa_id = @empresa_id;

-- 9. Rubros
DELETE FROM rubros WHERE empresa_id = @empresa_id;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Después de ejecutar:
-- 1. POST /api/sync/rubros   (trae WORKWEAR 3285 y OFFICE 3314)
-- 2. POST /api/sync/subrubros
-- 3. POST /api/sync/productos (solo productos de esos 2 rubros)
-- =============================================================================
