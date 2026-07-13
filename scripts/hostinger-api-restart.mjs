#!/usr/bin/env node
/**
 * Hostinger REST helpers for CI (restart Node.js app).
 *
 * Env:
 *   HOSTINGER_API_TOKEN  (required) — Bearer token from hPanel / developers.hostinger.com
 *   HOSTINGER_USERNAME   (default u967550282)
 *   HOSTINGER_DOMAIN     (default api.naturalonline.com.ar)
 *   HOSTINGER_API_BASE   (default https://developers.hostinger.com)
 *
 * Usage:
 *   node scripts/hostinger-api-restart.mjs
 */
const TOKEN = process.env.HOSTINGER_API_TOKEN?.trim();
const USERNAME = process.env.HOSTINGER_USERNAME?.trim() || 'u967550282';
const DOMAIN = process.env.HOSTINGER_DOMAIN?.trim() || 'api.naturalonline.com.ar';
const BASE = (process.env.HOSTINGER_API_BASE?.trim() || 'https://developers.hostinger.com').replace(
  /\/$/,
  ''
);

async function main() {
  if (!TOKEN) {
    console.error('HOSTINGER_API_TOKEN is required');
    process.exit(1);
  }

  const url = `${BASE}/api/hosting/v1/accounts/${encodeURIComponent(USERNAME)}/websites/${encodeURIComponent(DOMAIN)}/nodejs/server/restart`;
  console.log(`POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  console.log('status', res.status);
  console.log(typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body, null, 2));

  if (!res.ok) {
    process.exit(1);
  }
  console.log('Restart accepted.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
