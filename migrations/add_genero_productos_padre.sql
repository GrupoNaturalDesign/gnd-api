-- ============================================
-- Migración: Agregar campo genero a productos_padre
-- Para diferenciar Hombre/Dama/Unisex en listados y filtros
-- ============================================
-- Ejecutar después de aplicar el schema de Prisma (prisma migrate dev o db push).
-- Si aplicas solo este SQL manualmente, incluye los pasos 1 y 2.
-- El paso 3 (backfill) rellena genero desde el sufijo del codigo_agrupacion (_H/_D/_U).

-- 1. Agregar columna genero (omitir si ya la creó Prisma migrate)
ALTER TABLE productos_padre
ADD COLUMN genero VARCHAR(20) NULL AFTER slug;

-- 2. Índice para filtros por empresa + publicado + genero (omitir si ya existe)
CREATE INDEX idx_empresa_publicado_genero ON productos_padre (empresa_id, publicado, genero);

-- 3. Backfill: rellenar genero desde sufijo de codigo_agrupacion
-- _H = Masculino, _D = Femenino, _U = Unisex
UPDATE productos_padre
SET genero = CASE
  WHEN codigo_agrupacion REGEXP '_H$' THEN 'Masculino'
  WHEN codigo_agrupacion REGEXP '_D$' THEN 'Femenino'
  WHEN codigo_agrupacion REGEXP '_U$' THEN 'Unisex'
  ELSE NULL
END
WHERE genero IS NULL;

-- Opcional: rellenar desde la primera variante (productos_web) donde el código no tenga sufijo
UPDATE productos_padre pp
INNER JOIN (
  SELECT producto_padre_id, MIN(sexo) AS sexo
  FROM productos_web
  WHERE sexo IS NOT NULL
  GROUP BY producto_padre_id
) pw ON pp.id = pw.producto_padre_id
SET pp.genero = pw.sexo
WHERE pp.genero IS NULL;

SELECT 'Campo genero en productos_padre aplicado y backfill ejecutado' AS mensaje;
