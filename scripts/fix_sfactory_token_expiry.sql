-- Script para limpiar valores inválidos en sfactory_token_expiry
-- Ejecutar en Railway MySQL

-- Ver el estado actual
SELECT id, nombre, sfactory_token_expiry, sfactory_token 
FROM empresas 
WHERE sfactory_token_expiry IS NOT NULL;

-- Limpiar valores inválidos (NULL o '0000-00-00' o fechas fuera de rango)
UPDATE empresas 
SET sfactory_token_expiry = NULL 
WHERE sfactory_token_expiry = '0000-00-00 00:00:00' 
   OR sfactory_token_expiry < '1970-01-01 00:00:01'
   OR sfactory_token_expiry > '2038-01-19 03:14:07';

-- Verificar que se limpiaron
SELECT id, nombre, sfactory_token_expiry, sfactory_token 
FROM empresas;

