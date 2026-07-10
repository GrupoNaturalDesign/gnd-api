#!/usr/bin/env node
/**
 * Orquestador único de release prod → api.naturalonline.com.ar
 *
 * Flujo:
 *   npm run build → prepare-hostinger-env → zip → MCP deploy → SSH fix → MCP restart → smoke
 *
 * Uso:
 *   node scripts/deploy-hostinger-prod.mjs
 *   node scripts/deploy-hostinger-prod.mjs --skip-build --skip-zip
 *   node scripts/deploy-hostinger-prod.mjs --ssh-only
 *   node scripts/deploy-hostinger-prod.mjs --smoke-only
 *
 * Env:
 *   HOSTINGER_SSH_PASSWORD — para paso SSH (o 1er arg)
 *   HOSTINGER_API_BASE_URL — base para smoke (default prod)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSmokeHostingerProd } from './smoke-hostinger-prod.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..');

const PROD_DOMAIN = 'api.naturalonline.com.ar';
const RUNTIME_SSH = '/home/u967550282/domains/api.naturalonline.com.ar/nodejs';

const args = new Set(process.argv.slice(2));
const sshOnly = args.has('--ssh-only');
const smokeOnly = args.has('--smoke-only');
const skipBuild = args.has('--skip-build') || sshOnly || smokeOnly;
const skipEnv = args.has('--skip-env') || sshOnly || smokeOnly;
const skipZip = args.has('--skip-zip') || sshOnly || smokeOnly;
const skipSsh = args.has('--skip-ssh') || smokeOnly;
const skipSmoke = args.has('--skip-smoke');
const skipMcpHints = args.has('--skip-mcp-hints');

function run(cmd, cmdArgs, opts = {}) {
  console.log(`\n>>> ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? apiRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${cmdArgs.join(' ')}`);
  }
}

function findLatestZip() {
  const files = fs
    .readdirSync(repoRoot)
    .filter((f) => f.startsWith('gnd-api-deploy_') && f.endsWith('.zip'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(repoRoot, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.f ? path.join(repoRoot, files[0].f) : null;
}

function printMcpSteps(zipPath) {
  if (skipMcpHints) return;
  const manifest = {
    domain: PROD_DOMAIN,
    archivePath: zipPath,
    runtimePath: RUNTIME_SSH,
    generatedAt: new Date().toISOString(),
  };
  const manifestPath = path.join(apiRoot, 'deploy-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifestPath}`);

  console.log('\n=== MCP (Cursor Agent / Hostinger Connector) ===');
  console.log('1. hosting_deployJsApplication');
  console.log(`   domain: "${PROD_DOMAIN}"`);
  console.log(`   archivePath: "${zipPath}"`);
  console.log('2. Esperar build OK (hosting_listJsDeployments / hosting_getNodeJSBuildLogsV1)');
  console.log('3. SSH fix (automático si HOSTINGER_SSH_PASSWORD está seteado)');
  console.log('4. hosting_restartNode.jsApplicationV1');
  console.log(`   domain: "${PROD_DOMAIN}"`);
  console.log('5. Smoke: node scripts/smoke-hostinger-prod.mjs');
}

function runSshFix() {
  const password = process.argv.find((a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) ||
    process.env.HOSTINGER_SSH_PASSWORD;
  if (!password) {
    console.log('\nSKIP SSH: set HOSTINGER_SSH_PASSWORD o pasá la contraseña como argumento.');
    console.log(`  python scripts/ssh-hostinger-apply-api-fix.py <password>`);
    return;
  }
  run('python', ['scripts/ssh-hostinger-apply-api-fix.py', password]);
}

async function main() {
  console.log('GND API — deploy Hostinger prod');
  console.log(`Dominio: ${PROD_DOMAIN}`);
  console.log(`Runtime SSH: ${RUNTIME_SSH}`);

  if (smokeOnly) {
    const smoke = await runSmokeHostingerProd();
    if (!smoke.ok) process.exit(1);
    return;
  }

  if (!skipBuild) {
    run('npm', ['run', 'build']);
  }

  if (!skipEnv) {
    run('node', ['scripts/prepare-hostinger-env.mjs']);
  }

  let zipPath = findLatestZip();
  if (!skipZip) {
    run('python', ['scripts/make-hostinger-deploy-zip.py']);
    zipPath = findLatestZip();
  }

  if (!zipPath || !fs.existsSync(zipPath)) {
    throw new Error('No se encontró gnd-api-deploy_*.zip — corré make-hostinger-deploy-zip.py');
  }
  console.log(`\nDeploy zip: ${zipPath} (${fs.statSync(zipPath).size} bytes)`);

  printMcpSteps(zipPath);

  if (!skipSsh) {
    runSshFix();
    if (!skipMcpHints) {
      console.log('\n>>> Tras SSH fix: ejecutar hosting_restartNode.jsApplicationV1 en MCP');
    }
  }

  if (!skipSmoke) {
    console.log('\n=== Smoke tests ===');
    const smoke = await runSmokeHostingerProd();
    if (!smoke.ok) {
      console.error('\nSmoke falló. Si acabás de subir zip, corré MCP deploy + restart y reintentá con --smoke-only.');
      process.exit(1);
    }
  }

  console.log('\nDeploy pipeline local completado.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
