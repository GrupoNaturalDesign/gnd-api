CREATE TABLE IF NOT EXISTS portal_identidades (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  dni VARCHAR(8) NOT NULL,
  estado VARCHAR(16) NOT NULL DEFAULT 'pendiente',
  dni_verificado VARCHAR(8) NULL,
  aprobado_por INT UNSIGNED NULL,
  motivo VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY portal_identidades_dni_verificado_key (dni_verificado),
  CONSTRAINT portal_identidades_usuario_fk FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
