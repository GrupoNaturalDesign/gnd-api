CREATE TABLE IF NOT EXISTS `sfactory_inventory_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `warehouse_id` INT NOT NULL,
  `item_code` VARCHAR(100) NOT NULL,
  `stock` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `sale_price` DECIMAL(12,2) NULL,
  `source_updated_at` TIMESTAMP NULL,
  `last_seen_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sfactory_inventory_item` (`empresa_id`, `warehouse_id`, `item_code`),
  KEY `idx_sfactory_inventory_warehouse` (`empresa_id`, `warehouse_id`),
  KEY `idx_sfactory_inventory_code` (`item_code`),
  CONSTRAINT `sfactory_inventory_items_empresa_fk`
    FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sfactory_inventory_sync_state` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `warehouse_id` INT NOT NULL,
  `cursor_at` TIMESTAMP NULL,
  `initialized_at` TIMESTAMP NULL,
  `last_success_at` TIMESTAMP NULL,
  `last_error` TEXT NULL,
  `lock_token` VARCHAR(64) NULL,
  `locked_until` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sfactory_inventory_sync_state` (`empresa_id`, `warehouse_id`),
  KEY `idx_sfactory_inventory_lock` (`locked_until`),
  CONSTRAINT `sfactory_inventory_sync_state_empresa_fk`
    FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
