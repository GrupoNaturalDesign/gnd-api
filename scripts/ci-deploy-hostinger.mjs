#!/usr/bin/env node
/**
 * CI entry: build already done → SSH sync dist → API restart → smoke.
 *
 * Env secrets (GitHub Actions):
 *   HOSTINGER_SSH_PASSWORD
 *   HOSTINGER_API_TOKEN
 * Optional:
 *   HOSTINGER_SSH_HOST, HOSTINGER_SSH_PORT, HOSTINGER_SSH_USER
 *   HOSTINGER_USERNAME, HOSTINGER_DOMAIN
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSmokeHostingerProd } from './smoke-hostinger-prod.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

function run(cmd, args) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`Failed: ${cmd} ${args.join(' ')}`);
  }
}

async function main() {
  if (!process.env.HOSTINGER_SSH_PASSWORD) {
    throw new Error('HOSTINGER_SSH_PASSWORD missing');
  }
  if (!process.env.HOSTINGER_API_TOKEN) {
    throw new Error('HOSTINGER_API_TOKEN missing');
  }

  run('python3', ['scripts/ssh-hostinger-sync-dist.py']);
  run('python3', ['scripts/ssh-hostinger-prisma-deploy.py']);
  run('node', ['scripts/hostinger-api-restart.mjs']);

  console.log('\nWaiting 12s for process boot...');
  await new Promise((r) => setTimeout(r, 12_000));

  const smoke = await runSmokeHostingerProd();
  if (!smoke.ok) {
    console.error('Smoke failed after deploy');
    process.exit(1);
  }

  const postDeploySync = process.env.POST_DEPLOY_SYNC ?? 'rubros';
  if (postDeploySync !== 'none' && process.env.HOSTINGER_SSH_PASSWORD) {
    const syncArgs =
      postDeploySync === 'full'
        ? ['scripts/ssh-hostinger-sync-catalogo.py', '--full']
        : ['scripts/ssh-hostinger-sync-catalogo.py', '--rubros-only'];
    console.log(`\nPost-deploy catalog sync (${postDeploySync})…`);
    run('python3', syncArgs);
  } else if (postDeploySync !== 'none') {
    console.warn('POST_DEPLOY_SYNC set but HOSTINGER_SSH_PASSWORD missing; skipped');
  }

  console.log('\nCI deploy OK');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
