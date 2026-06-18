-- Modo de precio MP al crear checkout: transfer | financiado
ALTER TABLE `pedidos`
  ADD COLUMN `mp_pricing_mode` VARCHAR(20) NULL DEFAULT NULL
  AFTER `mp_preference_id`;
