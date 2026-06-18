-- Cuotas modular: proveedor en empresa + snapshot JSON en producto_precio
ALTER TABLE empresas
  ADD COLUMN installment_provider VARCHAR(50) NOT NULL DEFAULT 'mercado_pago' AFTER cuotas_financiado,
  ADD COLUMN installment_provider_options JSON NULL AFTER installment_provider;

ALTER TABLE productos_precios
  ADD COLUMN cuotas_snapshot JSON NULL AFTER precio_sin_imp;
