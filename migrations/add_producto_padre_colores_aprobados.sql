-- Colores aprobados en admin (override sobre whitelist estática NTDS)
CREATE TABLE IF NOT EXISTS `producto_padre_colores_aprobados` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `producto_padre_id` INT UNSIGNED NOT NULL,
  `color` VARCHAR(100) NOT NULL,
  `aprobado_por` VARCHAR(128) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `unique_padre_color_aprobado` (`producto_padre_id`, `color`),
  INDEX `idx_pp_colores_aprobados_empresa` (`empresa_id`),
  CONSTRAINT `pp_colores_aprobados_padre_fk` FOREIGN KEY (`producto_padre_id`) REFERENCES `productos_padre` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `pp_colores_aprobados_empresa_fk` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
