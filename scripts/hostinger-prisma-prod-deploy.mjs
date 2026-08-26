#!/usr/bin/env node
/**
 * En runtime Hostinger (nodejs/): prisma generate + migración SQL pendiente.
 * Uso vía SSH: cd nodejs && node scripts/hostinger-prisma-prod-deploy.mjs
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, '.env'), override: true });

const migrationFile = path.join(root, 'migrations', 'add_producto_padre_colores_aprobados.sql');

async function main() {
  console.log('>>> prisma generate');
  execSync('npx prisma generate --schema=./prisma/schema.prisma', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (!fs.existsSync(migrationFile)) {
    console.log('SKIP migration: file not found', migrationFile);
    return;
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');
  const host = process.env.DB_HOST || '127.0.0.1';
  const user = process.env.DB_USER;
  const password = process.env.DB_PASS;
  const database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error('DB_USER / DB_NAME missing in .env');
  }

  console.log('>>> apply migration add_producto_padre_colores_aprobados.sql');
  const conn = await mysql.createConnection({
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

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
