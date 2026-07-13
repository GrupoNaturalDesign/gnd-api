#!/usr/bin/env node
/**
 * Notify Discord about Hostinger deploy status (GitHub Actions).
 *
 * Env:
 *   DISCORD_WEBHOOK_URL (required to send; no-op exit 0 if missing)
 *   DEPLOY_STATUS       success | failure (default success)
 *   GITHUB_*            set automatically by Actions
 *
 * Usage:
 *   DEPLOY_STATUS=success node scripts/notify-discord-deploy.mjs
 *   DEPLOY_STATUS=failure node scripts/notify-discord-deploy.mjs
 */
const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
const status = (process.env.DEPLOY_STATUS || 'success').toLowerCase();
const ok = status === 'success';

if (!webhook) {
  console.log('DISCORD_WEBHOOK_URL not set — skip Discord notify');
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY || 'GrupoNaturalDesign/gnd-api';
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const fullSha = process.env.GITHUB_SHA || '';
const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'master';
const actor = process.env.GITHUB_ACTOR || 'unknown';
const runId = process.env.GITHUB_RUN_ID || '';
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
const runUrl = runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : `${serverUrl}/${repo}`;
const commitUrl = fullSha ? `${serverUrl}/${repo}/commit/${fullSha}` : runUrl;
const message = process.env.DEPLOY_MESSAGE?.trim() || '';

const color = ok ? 0x22c55e : 0xef4444;
const title = ok
  ? 'API Hostinger deploy OK'
  : 'API Hostinger deploy FAILED';

const fields = [
  { name: 'Repo', value: repo, inline: true },
  { name: 'Branch', value: ref, inline: true },
  { name: 'By', value: actor, inline: true },
  {
    name: 'Commit',
    value: sha ? `[${sha}](${commitUrl})` : '—',
    inline: true,
  },
  {
    name: 'Run',
    value: `[Open Actions](${runUrl})`,
    inline: true,
  },
  {
    name: 'Prod',
    value: '[api.naturalonline.com.ar](https://api.naturalonline.com.ar/api/health)',
    inline: true,
  },
];

if (message) {
  fields.push({ name: 'Detail', value: message.slice(0, 1000), inline: false });
}

const body = {
  username: 'GND Deploy',
  embeds: [
    {
      title,
      color,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'gnd-api → Hostinger' },
    },
  ],
};

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Discord webhook failed: ${res.status} ${text.slice(0, 300)}`);
  process.exit(1);
}

console.log(`Discord notified (${status})`);
