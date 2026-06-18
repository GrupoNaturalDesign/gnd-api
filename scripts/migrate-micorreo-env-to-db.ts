/**
 * Migra credenciales MiCorreo desde env a empresa_envio_config.
 *
 * Uso (desde api/):
 *   npx ts-node --require dotenv/config scripts/migrate-micorreo-env-to-db.ts [empresaId]
 */
import mysql from 'mysql2/promise';
import { encryptSecret } from '../src/lib/token-encryption';

const empresaId = Number.parseInt(process.argv[2] ?? '1', 10);
const integrationsEnv = (process.env.INTEGRATIONS_ENV ?? 'test').trim().toLowerCase();
const isProd = integrationsEnv === 'production' || integrationsEnv === 'prod';

function envEmail(): string {
  if (isProd) {
    return process.env.CORREO_EMAIL_PROD?.trim() || process.env.CORREO_EMAIL?.trim() || '';
  }
  return process.env.CORREO_EMAIL_QA?.trim() || process.env.CORREO_EMAIL?.trim() || '';
}

function envPassword(): string {
  if (isProd) {
    return (
      process.env.CORREO_VALIDATE_PASSWORD_PROD?.trim() ||
      process.env.CORREO_VALIDATE_PASSWORD?.trim() ||
      process.env.CORREO_PASSWORD_PROD?.trim() ||
      process.env.CORREO_PASSWORD?.trim() ||
      ''
    );
  }
  return (
    process.env.CORREO_VALIDATE_PASSWORD_QA?.trim() ||
    process.env.CORREO_VALIDATE_PASSWORD?.trim() ||
    process.env.CORREO_PASSWORD_QA?.trim() ||
    process.env.CORREO_PASSWORD?.trim() ||
    ''
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL requerido');
    process.exit(1);
  }
  const email = envEmail();
  const password = envPassword();
  if (!email || !password) {
    console.error('Faltan CORREO_EMAIL_* y password en env para migrar');
    process.exit(1);
  }
  const originCp = process.env.CORREO_ORIGIN_CP?.trim() || null;
  const originProv = process.env.CORREO_ORIGIN_PROVINCE_CODE?.trim().toUpperCase() || null;
  const passwordEnc = encryptSecret(password);
  const envLabel = isProd ? 'prod' : 'test';

  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.execute(
      'SELECT id FROM empresa_envio_config WHERE empresa_id = ? LIMIT 1',
      [empresaId]
    );
    const list = rows as Array<{ id: number }>;
    if (list.length === 0) {
      await conn.execute(
        `INSERT INTO empresa_envio_config
          (empresa_id, provider_default, correo_env, andreani_env, correo_account_email,
           correo_account_password_enc, correo_origin_cp, correo_origin_province_code,
           correo_account_status)
         VALUES (?, 'correo', ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          empresaId,
          envLabel,
          envLabel,
          email,
          passwordEnc,
          originCp,
          originProv?.length === 1 ? originProv : null,
        ]
      );
      console.log(`Creado empresa_envio_config para empresa ${empresaId}`);
    } else {
      await conn.execute(
        `UPDATE empresa_envio_config SET
          correo_account_email = ?,
          correo_account_password_enc = ?,
          correo_origin_cp = COALESCE(?, correo_origin_cp),
          correo_origin_province_code = COALESCE(?, correo_origin_province_code),
          correo_account_status = 'pending',
          updated_at = NOW()
         WHERE empresa_id = ?`,
        [email, passwordEnc, originCp, originProv?.length === 1 ? originProv : null, empresaId]
      );
      console.log(`Actualizado empresa_envio_config para empresa ${empresaId}`);
    }
    console.log('Siguiente paso: Admin → Envíos → Vincular cuenta');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
