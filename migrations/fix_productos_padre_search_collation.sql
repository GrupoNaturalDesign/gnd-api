-- Unifica collation en columnas usadas en búsqueda LIKE (evita mix utf8mb4_bin / utf8mb4_unicode_ci).
-- Ejecutar una vez en cada entorno: mysql ... < fix_productos_padre_search_collation.sql

ALTER TABLE productos_padre
  MODIFY COLUMN nombre VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  MODIFY COLUMN descripcion TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  MODIFY COLUMN descripcion_corta VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  MODIFY COLUMN codigo_agrupacion VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
