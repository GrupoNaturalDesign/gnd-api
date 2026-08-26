#!/usr/bin/env node
/**
 * Runtime Hostinger (nodejs/): verifica Prisma Client subido desde CI + migración SQL.
 * Usa mariadb (dependency directa); no instancia PrismaClient (requiere adapter en prod).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mariadb from 'mariadb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, '.env'), override: true });

const migrationFile = path.join(root, 'migrations', 'add_producto_padre_colores_aprobados.sql');

function verifyPrismaClientArtifacts() {
  const candidates = [
    path.join(root, 'node_modules', '@prisma', 'client', 'index.js'),
    path.join(root, 'node_modules', '@prisma', 'client', 'default.js'),
    path.join(root, 'node_modules', '.prisma', 'client', 'index.js'),
  ];

  let hits = 0;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (
      text.includes('ProductoPadreColorAprobado') ||
      text.includes('productoPadreColorAprobado')
    ) {
      hits++;
    }
  }

  if (hits === 0) {
    throw new Error(
      'ProductoPadreColorAprobado not found in uploaded @prisma/client — redeploy from CI build'
    );
  }
  console.log('Prisma client artifacts OK');
}

async function applyMigration() {
  if (!fs.existsSync(migrationFile)) {
    console.log('SKIP migration: file not found', migrationFile);
    return;
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const user = process.env.DB_USER;
  const password = process.env.DB_PASS;
  const database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error('DB_USER / DB_NAME missing in .env');
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');
  console.log('>>> apply migration add_producto_padre_colores_aprobados.sql');

  const conn = await mariadb.createConnection({
    host,
    user,
    password,
    database,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('Migration OK');
  } finally {
    await conn.end();
  }
}

async function main() {
  console.log('>>> verify Prisma client artifacts');
  verifyPrismaClientArtifacts();
  await applyMigration();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
