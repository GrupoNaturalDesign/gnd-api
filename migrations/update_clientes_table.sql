-- ============================================
-- Migración: Actualizar tabla clientes
-- Agregar campos para integración con SFactory
-- ============================================
-- IMPORTANTE: Reemplaza 'nombre_de_tu_base_de_datos' con el nombre real de tu BD
-- O selecciona la base de datos manualmente en tu cliente MySQL antes de ejecutar

-- USE nombre_de_tu_base_de_datos;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Hacer sfactory_id nullable (para permitir clientes antes de crearlos en SFactory)
ALTER TABLE clientes 
MODIFY COLUMN sfactory_id INT NULL;

-- 2. Agregar nuevos campos
ALTER TABLE clientes 
ADD COLUMN tipo VARCHAR(10) NULL AFTER cuit,
ADD COLUMN activo BOOLEAN DEFAULT TRUE AFTER tipo,
ADD COLUMN movil VARCHAR(50) NULL AFTER telefono,
ADD COLUMN cp_fiscal VARCHAR(20) NULL AFTER pais_id,
ADD COLUMN categoria_fiscal VARCHAR(50) NULL AFTER cp_fiscal,
ADD COLUMN codigo_externo VARCHAR(100) NULL AFTER categoria_fiscal;

-- 3. Agregar índice para el campo activo
ALTER TABLE clientes 
ADD INDEX idx_activo (activo);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- Verificación
-- ============================================
SELECT 'Tabla clientes actualizada correctamente' AS mensaje;

