# Deploy API en Hostinger (Node.js managed)

## Sitio Node.js

- **Dominio:** `slategray-manatee-407634.hostingersite.com`
- **Usuario hosting:** `u967550282`
- **Framework:** Express.js
- **Node:** 20
- **Build:** `npm run build` (`prisma generate && tsc`)
- **Start:** `npm start` → `node dist/index.js`
- **Entry file:** `dist/index.js`

## Variables de entorno

Generar/actualizar desde Vercel + `.env` local:

```bash
cd api
node scripts/prepare-hostinger-env.mjs
```

Salida: `api/hostinger.env` (74 vars). **No commitear.**

En hPanel → sitio Node → **Environment Variables** → pegar cada línea `KEY=value` (o importar según UI).

Cambios críticos respecto a Vercel:

| Variable | Valor en Hostinger |
|----------|-------------------|
| `DB_HOST` | `localhost` |
| `NODE_ENV` | `production` |
| `INTEGRATIONS_ENV` | `production` |

No incluir: `DATABASE_URL` (Railway), `VERCEL_*`, `TURBO_*`, `NEXT_PUBLIC_*`, `REDIS_URL`.

Después de cargar env vars → **Restart** o **Redeploy**.

## Deploy desde Cursor (MCP)

1. Crear zip (sin `node_modules`, `dist`, secretos):

```bash
tar -a -cf ../gnd-api-deploy.zip \
  --exclude=node_modules --exclude=dist \
  --exclude=.env --exclude=hostinger.env \
  --exclude=serviceAccountKey.json \
  -C api .
```

2. En Agent chat con Hostinger Connector: deploy a `slategray-manatee-407634.hostingersite.com`

3. Verificar build:

```
GET https://slategray-manatee-407634.hostingersite.com/health
```

Esperado: `{ "ok": true, "db": "connected" }`

## Build settings en hPanel (si el auto-detect falla)

| Campo | Valor |
|-------|-------|
| Framework | Express.js |
| Node version | 20 |
| Install | `npm install` |
| Build | `npm run build` |
| Start | `npm start` |
| Entry file | `dist/index.js` |

## Troubleshooting

- **`entry_file: index.js`** en logs viejos → corregir a `dist/index.js`
- **`db: disconnected`** → `DB_HOST` debe ser `localhost`
- **`prisma generate` falla en build** → cargar `DB_*` en env vars antes del build
- **Pool timeout** → no usar `srv1438.hstgr.io` desde la API en Hostinger; solo `localhost`
