# Deploy API en Hostinger (prod oficial)

Runtime de producción: **`api.naturalonline.com.ar`** — path SSH:

```text
/home/u967550282/domains/api.naturalonline.com.ar/nodejs/
```

No usar sitios obsoletos `slategray-manatee-407634` ni `azure-skunk-643837` (ver [Limpieza](#sitios-obsoletos)).

| Campo | Valor |
|-------|-------|
| Usuario hosting | `u967550282` |
| SSH | `ssh -p 65002 u967550282@82.25.67.184` |
| Framework | Express.js, Node 20 |
| Build local | `npm run build` (`prisma generate && tsc`) |
| Start plataforma | `npm start` → `node dist/index.js` |
| Entry file hPanel | `dist/index.js` |
| MySQL | `DB_HOST=127.0.0.1`, DB `u967550282_gnd` |
| Monitoreo | `GET https://api.naturalonline.com.ar/api/health` |

> `/health` (sin prefijo `/api`) puede devolver 404 en Hostinger. Usar siempre **`/api/health`**.

---

## Push-to-deploy (GitHub Actions) — simil Vercel

Cada **push a `master`** en [GrupoNaturalDesign/gnd-api](https://github.com/GrupoNaturalDesign/gnd-api) corre [`.github/workflows/deploy-hostinger.yml`](../.github/workflows/deploy-hostinger.yml):

1. `npm ci` + `npm run build` en GitHub
2. SSH sync de `dist/` → `nodejs/dist` ([`ssh-hostinger-sync-dist.py`](../scripts/ssh-hostinger-sync-dist.py))
3. Enforce `DB_HOST=127.0.0.1` en `.env` del runtime
4. Restart vía API ([`hostinger-api-restart.mjs`](../scripts/hostinger-api-restart.mjs))
5. Smoke: `/api/health`, `/api/rubros`, webhook MP

### Secrets (una vez)

En el repo GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Valor |
|--------|--------|
| `HOSTINGER_SSH_PASSWORD` | Password SSH (`ssh -p 65002 u967550282@82.25.67.184`) |
| `HOSTINGER_API_TOKEN` | Token en [developers.hostinger.com](https://developers.hostinger.com) (o hPanel → API) |

Opcional (Variables): `HOSTINGER_DOMAIN`, `HOSTINGER_USERNAME`, host/port SSH.

### Manual / local igual que CI

```bash
npm run build
npm run deploy:hostinger-ci   # requiere HOSTINGER_SSH_PASSWORD + HOSTINGER_API_TOKEN
```

También: Actions → **Deploy Hostinger** → **Run workflow**.

**Alcance:** sincroniza código compilado (`dist/`). No reinstala `node_modules` ni regenera Prisma en el servidor. Si cambiás dependencias npm o `schema.prisma`, usá además un deploy archive/MCP completo (sección siguiente).

---

## Release local (MCP + zip)

```bash
cd api
npm run deploy:hostinger-prod
```
El orquestador [`scripts/deploy-hostinger-prod.mjs`](../scripts/deploy-hostinger-prod.mjs) ejecuta:

1. `npm run build`
2. `node scripts/prepare-hostinger-env.mjs` → `hostinger.env` (no commitear)
3. `python scripts/make-hostinger-deploy-zip.py` → `gnd-api-deploy_*.zip` en la raíz del monorepo
4. Escribe `deploy-manifest.json` e indica pasos MCP
5. SSH [`ssh-hostinger-apply-api-fix.py`](../scripts/ssh-hostinger-apply-api-fix.py) si `HOSTINGER_SSH_PASSWORD` está definida
6. Smoke: `npm run smoke:hostinger-prod`

### Pasos MCP (Cursor / Hostinger Connector)

Tras el zip local:

1. **`hosting_deployJsApplication`**
   - `domain`: `api.naturalonline.com.ar`
   - `archivePath`: ruta del zip (ver `deploy-manifest.json`)
2. Esperar build OK (`hosting_listJsDeployments` / logs)
3. SSH fix (sube `.env` + parches `dist/` al path `nodejs/`)
4. **`hosting_restartNode.jsApplicationV1`** → `domain`: `api.naturalonline.com.ar`
5. `npm run smoke:hostinger-prod`

Solo smoke:

```bash
npm run smoke:hostinger-prod
```

Solo SSH + env (sin rebuild):

```bash
node scripts/deploy-hostinger-prod.mjs --ssh-only
```

---

## Variables de entorno

Generar desde Vercel + `.env` local:

```bash
cd api
node scripts/prepare-hostinger-env.mjs
```

Salida: `api/hostinger.env`. **No commitear.**

| Variable | Valor prod |
|----------|------------|
| `DB_HOST` | `127.0.0.1` (no `localhost`: en Hostinger resuelve a `::1` y MySQL rechaza el usuario) |
| `DB_POOL_LIMIT` | `5` (shared hosting) |
| `NODE_ENV` | `production` |
| `INTEGRATIONS_ENV` | `production` |
| `MP_WEBHOOK_URL` | `https://api.naturalonline.com.ar/api/webhooks/mercadopago` |
| `FIREBASE_ADMIN_SDK_JSON_B64` | Base64 del service account (nunca JSON escapado en `.env`) |

No incluir: `DATABASE_URL`, `VERCEL_*`, `NEXT_PUBLIC_*`, `REDIS_URL`, `NGROK_URL`.

El script SSH copia `hostinger.env` a:

- `nodejs/.env` (runtime real)
- `public_html/.builds/config/.env` (builds de plataforma)

---

## Mercado Pago — webhook

Verificación automática:

```bash
npm run verify:mp-webhook-prod
```

Esperado: `MP_WEBHOOK_URL` correcta y `POST` al endpoint devuelve **401** (firma inválida), no 404.

**Panel MP (manual):** [developers.mercadopago.com](https://www.mercadopago.com.ar/developers/panel/app) → Webhooks → URL de producción:

```text
https://api.naturalonline.com.ar/api/webhooks/mercadopago
```

Test E2E: [checkout-qa-operativo.md](./checkout-qa-operativo.md) Caso 2 (pago MP → pedido `confirmado` + PE SFactory).

---

## MySQL — conexiones remotas

La API en Hostinger usa **`localhost`**. No debe haber acceso remoto `%` en hPanel si nadie más conecta desde fuera.

Reglas revocadas en migración (jul 2026). Si necesitás acceso local de desarrollo:

- phpMyAdmin desde hPanel, o
- túnel SSH — no `srv1438.hstgr.io` desde Vercel.

**Validación 7 días post-migración:** revisar `nodejs/console.log` en busca de `pool timeout` / `P1001`. Pool configurado en [`db-config.ts`](../src/lib/db-config.ts) con `DB_POOL_LIMIT=5`.

---

## Vercel API (apagada)

El proyecto **`gnd-back`** fue eliminado de Vercel y el repo Git desconectado (jul 2026). Solo **`api.naturalonline.com.ar`** (Hostinger) recibe tráfico de tienda.

El cliente Vercel (`gruponaturaldesign` / `naturalonline.com.ar`) sigue activo con `NEXT_PUBLIC_API_URL=https://api.naturalonline.com.ar/api`.

---

## Monitoreo y runbook

### Uptime externo

Configurar chequeo cada **5 minutos**:

```text
GET https://api.naturalonline.com.ar/api/health
```

Esperado: HTTP 200 y `{"success":true,...}`.

Servicios sugeridos: UptimeRobot, Better Stack, Freshping (plan gratuito).

### Runbook — API caída

1. **Smoke rápido:** `npm run smoke:hostinger-prod`
2. **hPanel** → Websites → `api.naturalonline.com.ar` → Node.js → **Restart**
3. **SSH** al runtime:
   ```bash
   ssh -p 65002 u967550282@82.25.67.184
   cd /home/u967550282/domains/api.naturalonline.com.ar/nodejs
   head -5 .env                    # DB_HOST=localhost, FIREBASE_ADMIN_SDK_JSON_B64 presente
   tail -100 console.log           # errores Prisma / Firebase
   ```
4. **Firebase:** en SSH, `node -e "require('dotenv').config({override:true}); require('./dist/lib/firebase-admin').getFirebaseAdmin(); console.log('ok')"`
5. **Redeploy:** `npm run deploy:hostinger-prod` + MCP deploy + restart
6. **DB:** phpMyAdmin — conexiones activas estables; sin picos anómalos

### Logs

- Runtime: `nodejs/console.log`
- Builds plataforma: hPanel → Node.js → Build logs / MCP `hosting_getNodeJSBuildLogsV1`

---

## Sitios obsoletos

**No deployar** en:

| Sitio | URL |
|-------|-----|
| slategray | `slategray-manatee-407634.hostingersite.com` |
| azure-skunk | `azure-skunk-643837.hostingersite.com` |

**Eliminación programada:** tras **1 semana estable** en prod, borrar ambos sitios Node en hPanel (Websites → Delete). Hasta entonces, ignorar.

Scripts SSH legacy movidos a [`scripts/legacy/`](../scripts/legacy/).

---

## Troubleshooting

| Síntoma | Acción |
|---------|--------|
| `entry_file: index.js` en logs | Entry file = `dist/index.js` |
| `db: disconnected` / pool timeout | `DB_HOST=127.0.0.1` (no `localhost`/IPv6 `::1`); verificar que `db-config` normalice host |
| `Access denied ... '@'::1'` | MySQL rechaza IPv6 localhost — usar `127.0.0.1` |
| `Bad escaped character in JSON` en login | Regenerar env con `prepare-hostinger-env.mjs`; usar `FIREBASE_ADMIN_SDK_JSON_B64` |
| Build falla `tsc` en servidor | Zip debe incluir `dist/` precompilado (`make-hostinger-deploy-zip.py`) |
| 404 público tras SSH manual | Usar deploy plataforma + dominio; no `nohup` suelto en :3002 |
| Git deploy hPanel roto (`Repositorio: —`) | No usar; archive deploy es el camino oficial |
| Cron keepalive | No disponible en shared (`crontab: command not found`) — confiar en proceso persistente Hostinger |

---

## Scripts activos

| Script | Uso |
|--------|-----|
| `deploy-hostinger-prod.mjs` | Orquestador release |
| `prepare-hostinger-env.mjs` | Genera `hostinger.env` |
| `make-hostinger-deploy-zip.py` | Zip con `dist/` |
| `ssh-hostinger-apply-api-fix.py` | Sube `.env` + parches a `nodejs/` |
| `smoke-hostinger-prod.mjs` | Health, rubros, webhook |
| `verify-mp-webhook-prod.mjs` | URL MP + reachability |
