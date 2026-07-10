/**
 * Merge api/.env.vercel.production + api/.env → api/hostinger.env
 * Run: node scripts/prepare-hostinger-env.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

const SKIP_PREFIXES = ['VERCEL_', 'TURBO_', 'NX_', 'NEXT_PUBLIC_'];
const SKIP_KEYS = new Set([
  'DATABASE_URL',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'REDIS_URL',
  'VERCEL',
  'MP_WEBHOOK_URL',
  'ANDREANI_DEFAULT_ENV',
  'CORREO_DEFAULT_ENV',
  'NGROK_URL',
]);

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function serializeEnv(env) {
  return (
    Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        if (/[\s#"'\\]/.test(v) || v.includes('\n')) {
          return `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return `${k}=${v}`;
      })
      .join('\n') + '\n'
  );
}

const vercelPath = path.join(apiRoot, '.env.vercel.production');
const localPath = path.join(apiRoot, '.env');
const firebasePath = path.join(apiRoot, 'serviceAccountKey.json');

const vercel = fs.existsSync(vercelPath) ? parseEnvFile(fs.readFileSync(vercelPath, 'utf8')) : {};
const local = fs.existsSync(localPath) ? parseEnvFile(fs.readFileSync(localPath, 'utf8')) : {};
// Vercel prod primero; local solo completa vacíos.
const merged = { ...vercel };
for (const [k, v] of Object.entries(local)) {
  if (!merged[k] || merged[k] === '') merged[k] = v;
}

for (const key of Object.keys(merged)) {
  if (SKIP_KEYS.has(key) || SKIP_PREFIXES.some((p) => key.startsWith(p))) {
    delete merged[key];
  }
}

// Hostinger production overrides
merged.DB_HOST = 'localhost';
merged.NODE_ENV = 'production';
merged.PORT = merged.PORT === '3003' ? '3002' : (merged.PORT || '3002');
merged.PEDIDO_CHECKOUT_JOBS_ENABLED = 'true';
merged.EMPRESA_ID = merged.EMPRESA_ID || '1';
merged.INTEGRATIONS_ENV = 'production';
merged.MAINTENANCE_MODE = merged.MAINTENANCE_MODE || 'off';
merged.SFACTORY_PEDIDO_EXTERNO_SOURCE = merged.SFACTORY_PEDIDO_EXTERNO_SOURCE || 'ecommerce';
merged.SFACTORY_WAREHOUSE_ID_ECOM = merged.SFACTORY_WAREHOUSE_ID_ECOM || '52624';
merged.CHECKOUT_PUBLIC_URL =
  merged.CHECKOUT_PUBLIC_URL || 'https://naturalonline.com.ar';
merged.CORS_ORIGIN =
  'https://naturalonline.com.ar,https://www.naturalonline.com.ar,https://gruponaturaldesign-sigma.vercel.app';
merged.NEWSLETTER_MAX_RECIPIENTS = merged.NEWSLETTER_MAX_RECIPIENTS || '50';
merged.SHIPPING_ALTO_POR_PRENDA_CM = merged.SHIPPING_ALTO_POR_PRENDA_CM || '8';
merged.DB_POOL_LIMIT = merged.DB_POOL_LIMIT || '5';

if (!merged.FIREBASE_ADMIN_SDK_JSON && fs.existsSync(firebasePath)) {
  merged.FIREBASE_ADMIN_SDK_JSON = fs.readFileSync(firebasePath, 'utf8').trim();
}

// Drop empty values (keep explicit false/0)
for (const [k, v] of Object.entries(merged)) {
  if (v === '' || v === undefined) delete merged[k];
}

const outPath = path.join(apiRoot, 'hostinger.env');
fs.writeFileSync(outPath, serializeEnv(merged), 'utf8');
console.log(`Wrote ${outPath} (${Object.keys(merged).length} variables)`);
