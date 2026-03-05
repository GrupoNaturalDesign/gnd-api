-- =============================================================================
-- INSERT EMPRESA POR DEFECTO
-- =============================================================================
-- La API resuelve empresaId con SFACTORY_COMPANY_KEY (.env).
-- Si no existe ninguna empresa con ese sfactory_company_key, los endpoints
-- que usan empresaMiddleware devuelven 500 / "Empresa no encontrada".
--
-- Ejecutar este script cuando:
-- - La tabla empresas está vacía.
-- - Cambiaste de base de datos o entorno.
--
-- IMPORTANTE: Reemplazá @sfactory_company_key por el valor de SFACTORY_COMPANY_KEY
-- de tu .env (o dejá el que está si es el que usás).
-- =============================================================================

-- Valor que debe coincidir con SFACTORY_COMPANY_KEY en api/.env
SET @sfactory_company_key = '867c09d0bb9a7e9ac0c93e1747352d8d';

INSERT INTO empresas (
  codigo,
  nombre,
  razon_social,
  cuit,
  sfactory_company_key,
  activa,
  created_at,
  updated_at
) VALUES (
  'NDTS',
  'Natural Design',
  'Natural Design S.A.',
  NULL,
  @sfactory_company_key,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON DUPLICATE KEY UPDATE
  activa = 1,
  updated_at = CURRENT_TIMESTAMP;

-- Verificar (opcional):
-- SELECT id, codigo, nombre, sfactory_company_key, activa FROM empresas WHERE sfactory_company_key = @sfactory_company_key;
