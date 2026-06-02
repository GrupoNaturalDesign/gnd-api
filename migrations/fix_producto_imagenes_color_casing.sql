-- Alinear producto_imagenes.color con productos_web.color (mismo producto_web_id, distinto casing)
-- Ejecutar una vez por entorno: mysql ... < fix_producto_imagenes_color_casing.sql

UPDATE producto_imagenes pi
INNER JOIN productos_web pw ON pw.id = pi.producto_web_id
SET pi.color = pw.color
WHERE pi.color IS NOT NULL
  AND pw.color IS NOT NULL
  AND UPPER(TRIM(pi.color)) = UPPER(TRIM(pw.color))
  AND pi.color <> pw.color;
