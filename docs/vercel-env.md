# Configuración en Vercel (API / DB pool)

> **Deprecado (jul 2026):** la API de producción está en Hostinger (`api.naturalonline.com.ar`). El proyecto Vercel `gnd-back` fue eliminado. Ver [hostinger-deploy.md](./hostinger-deploy.md).

Para evitar **pool timeout** en el backend desplegado en Vercel, configura estas variables de entorno en el proyecto de la API.

## Dónde configurarlas

1. Entra en [Vercel](https://vercel.com) → tu proyecto del **backend** (ej. `gnd-back`).
2. **Settings** → **Environment Variables**.
3. Añade o edita las variables siguientes.

## Variables recomendadas

| Variable | Valor recomendado | Descripción |
|----------|-------------------|-------------|
| `DB_POOL_LIMIT` | `10` | Número máximo de conexiones en el pool. Por defecto el código usa 10; en serverless no conviene subir mucho (cada instancia tiene su pool). |
| `DB_CONNECT_TIMEOUT` | `30000` | Timeout en ms para obtener una conexión del pool (30 s). Por defecto el código usa 30000. |

Si ya tienes `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` configurados, no hace falta cambiarlos. Solo asegúrate de que **existan** `DB_POOL_LIMIT` y/o `DB_CONNECT_TIMEOUT` si quieres valores distintos a los del código.

## Después de cambiar variables

- **Redeploy** el backend (Deployments → ⋮ en el último deploy → Redeploy), o haz un nuevo deploy desde tu rama para que las nuevas variables se apliquen.

## Resumen

- **Pool:** el código ya no usa `connectionLimit: 2`; usa `DB_POOL_LIMIT` (default 10) y `DB_CONNECT_TIMEOUT` (default 30000).
- **Bulk:** las actualizaciones masivas (`PATCH /api/productos-web/bulk`) se ejecutan en lotes de 5 para no saturar el pool.
- En Vercel solo necesitas definir `DB_POOL_LIMIT` y `DB_CONNECT_TIMEOUT` si quieres valores distintos a 10 y 30000; si no, el redeploy con el código nuevo es suficiente.
