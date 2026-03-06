-- ============================================
-- Solo BACKFILL de genero en productos_padre
-- Ejecutar solo si ya aplicaste el schema con Prisma (migrate o db push).
-- ============================================

-- Rellenar desde sufijo de codigo_agrupacion: _H = Masculino, _D = Femenino, _U = Unisex
UPDATE productos_padre
SET genero = CASE
  WHEN codigo_agrupacion REGEXP '_H$' THEN 'Masculino'
  WHEN codigo_agrupacion REGEXP '_D$' THEN 'Femenino'
  WHEN codigo_agrupacion REGEXP '_U$' THEN 'Unisex'
  ELSE NULL
END
WHERE genero IS NULL;

-- Opcional: rellenar desde la primera variante donde el código no tenga sufijo
UPDATE productos_padre pp
INNER JOIN (
  SELECT producto_padre_id, MIN(sexo) AS sexo
  FROM productos_web
  WHERE sexo IS NOT NULL
  GROUP BY producto_padre_id
) pw ON pp.id = pw.producto_padre_id
SET pp.genero = pw.sexo
WHERE pp.genero IS NULL;

SELECT 'Backfill genero ejecutado' AS mensaje;
