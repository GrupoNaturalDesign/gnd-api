/**
 * Smoke tests for prod API on api.naturalonline.com.ar
 * Run: node scripts/smoke-hostinger-prod.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';
const BASE = process.env.HOSTINGER_API_BASE_URL?.replace(/\/$/, '') ||
  'https://api.naturalonline.com.ar';

const MP_WEBHOOK_URL =
  process.env.MP_WEBHOOK_URL ||
  'https://api.naturalonline.com.ar/api/webhooks/mercadopago';

const checks = [];

async function get(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { url, status: res.status, text, json };
}

async function postWebhook() {
  const res = await fetch(MP_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return { url: MP_WEBHOOK_URL, status: res.status };
}

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`OK  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

export async function runSmokeHostingerProd() {
  const root = await get('/');
  if (root.status === 200) {
    pass('GET /', `status ${root.status}`);
  } else {
    fail('GET /', `status ${root.status}`);
  }

  const health = await get('/api/health');
  if (health.status === 200 && health.json?.success) {
    pass('GET /api/health', health.json.message ?? 'ok');
  } else {
    fail('GET /api/health', `status ${health.status} body=${health.text.slice(0, 120)}`);
  }

  const rubros = await get('/api/rubros');
  if (rubros.status === 200) {
    const count = Array.isArray(rubros.json?.data)
      ? rubros.json.data.length
      : Array.isArray(rubros.json)
        ? rubros.json.length
        : '?';
    pass('GET /api/rubros', `status ${rubros.status}, items=${count}`);
  } else {
    fail('GET /api/rubros', `status ${rubros.status}`);
  }

  const webhook = await postWebhook();
  if (webhook.status === 401) {
    pass('POST /api/webhooks/mercadopago', '401 (ruta activa, firma requerida en live)');
  } else if (webhook.status === 404) {
    fail('POST /api/webhooks/mercadopago', '404 — revisar routing o deploy');
  } else {
    pass('POST /api/webhooks/mercadopago', `status ${webhook.status}`);
  }

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, base: BASE, mpWebhookUrl: MP_WEBHOOK_URL };
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
  runSmokeHostingerProd()
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
