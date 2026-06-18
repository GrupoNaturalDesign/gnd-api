-- MiCorreo: cuenta comercial por empresa (admin), customerId y origen en BD.
ALTER TABLE empresa_envio_config
  ADD COLUMN correo_account_email VARCHAR(255) NULL AFTER correo_sender_data,
  ADD COLUMN correo_account_password_enc TEXT NULL AFTER correo_account_email,
  ADD COLUMN correo_customer_id VARCHAR(50) NULL AFTER correo_account_password_enc,
  ADD COLUMN correo_account_status VARCHAR(20) NOT NULL DEFAULT 'not_configured' AFTER correo_customer_id,
  ADD COLUMN correo_account_validated_at TIMESTAMP NULL AFTER correo_account_status,
  ADD COLUMN correo_account_last_error TEXT NULL AFTER correo_account_validated_at,
  ADD COLUMN correo_origin_cp VARCHAR(10) NULL AFTER correo_account_last_error,
  ADD COLUMN correo_origin_province_code CHAR(1) NULL AFTER correo_origin_cp;
