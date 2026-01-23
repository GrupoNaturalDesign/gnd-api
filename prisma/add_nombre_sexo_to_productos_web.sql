-- Script para agregar columnas nombre y sexo a productos_web
-- Ejecutar este script en tu base de datos MySQL

-- Agregar columna nombre (requerida, pero primero la agregamos como nullable para poder migrar datos existentes)
ALTER TABLE `productos_web` 
ADD COLUMN `nombre` VARCHAR(500) NULL AFTER `sfactory_barcode`;

-- Agregar columna sexo (opcional)
ALTER TABLE `productos_web` 
ADD COLUMN `sexo` VARCHAR(20) NULL AFTER `nombre`;

-- Actualizar nombre con descripcion_completa para registros existentes
UPDATE `productos_web` 
SET `nombre` = `descripcion_completa` 
WHERE `nombre` IS NULL;

-- Ahora hacer nombre NOT NULL
ALTER TABLE `productos_web` 
MODIFY COLUMN `nombre` VARCHAR(500) NOT NULL;

-- Cambiar descripcion_completa a nullable (ahora es opcional para que el admin pueda editarla)
ALTER TABLE `productos_web` 
MODIFY COLUMN `descripcion_completa` VARCHAR(500) NULL;

-- Agregar índice para sexo (para filtros)
CREATE INDEX `idx_sexo` ON `productos_web` (`sexo`);








