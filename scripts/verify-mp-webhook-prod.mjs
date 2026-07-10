/**
 * Verifica configuración y reachability del webhook MP en prod.
 * Panel MP (manual): developers.mercadopago.com → Webhooks → misma URL.
 * Run: node scripts/verify-mp-webhook-prod.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

const EXPECTED =
  'https://api.naturalonline.com.ar/api/webhooks/mercadopago';

function readMpWebhookFromHostingerEnv() {
  const envPath = path.join(apiRoot, 'hostinger.env');
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('MP_WEBHOOK_URL=')) {
      return line.slice('MP_WEBHOOK_URL='.length).trim().replace(/^"|"$/g, '');
    }
  }
  return null;
}

async function main() {
  const fromEnv = readMpWebhookFromHostingerEnv();
  console.log('MP_WEBHOOK_URL (hostinger.env):', fromEnv ?? '(archivo no encontrado)');
  console.log('MP_WEBHOOK_URL (esperado):     ', EXPECTED);

  if (fromEnv !== EXPECTED) {
    console.error('\nMismatch: ejecutá `node scripts/prepare-hostinger-env.mjs` y redeploy.');
    process.exit(1);
  }

  const res = await fetch(EXPECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment', data: { id: 'smoke-test' } }),
  });

  console.log('\nPOST webhook status:', res.status);
  if (res.status === 404) {
    console.error('Endpoint no encontrado — revisar deploy y rutas Express.');
    process.exit(1);
  }
  if (res.status === 401) {
    console.log('OK: endpoint público responde; firma inválida es esperado sin headers MP.');
  }

  console.log('\n--- Panel Mercado Pago (manual) ---');
  console.log('1. https://www.mercadopago.com.ar/developers/panel/app');
  console.log('2. Tu aplicación de producción → Webhooks / Notificaciones IPN');
  console.log(`3. URL de producción: ${EXPECTED}`);
  console.log('4. Eventos: payment (y merchant_order si aplica)');
  console.log('5. Test E2E: checkout MP en tienda → pago → pedido confirmado + PE SFactory');
  console.log('   Ver: api/docs/checkout-qa-operativo.md Caso 2');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
