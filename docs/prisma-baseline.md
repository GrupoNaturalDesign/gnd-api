# Prisma Migrate: error P3005 y baseline en BD existente

## Qué es P3005

Al ejecutar `npx prisma migrate deploy` aparece:

```text
Error: P3005
The database schema is not empty.
```

Significa que la base **ya tiene tablas** (no está “vacía” para Migrate), pero Prisma **no puede aplicar el historial de migraciones** de forma segura: suele faltar la tabla **`_prisma_migrations`**, o está vacía / desincronizada respecto de lo que ya existe físicamente (por ejemplo el esquema se creó con `db push`, SQL manual o otro entorno sin `migrate deploy`).

Hasta que ese historial esté alineado con la realidad de la BD, `migrate deploy` se niega a correr (evita duplicar `CREATE TABLE`, etc.).

## Comprobar el estado

En MySQL:

```sql
SHOW TABLES LIKE '_prisma_migrations';
SELECT migration_name, finished_at, success FROM _prisma_migrations ORDER BY finished_at;
```

- Si la tabla **no existe**: hay que hacer **baseline** (marcar migraciones ya “contenidas” en el esquema actual sin volver a ejecutarlas).
- Si la tabla **existe** y tiene filas: revisar qué migraciones faltan respecto del directorio `prisma/migrations/` del repo.

## Enfoque recomendado (BD ya coincide con el esquema del repo)

Si el esquema remoto **ya es equivalente** a lo que dejarían las migraciones del repositorio (mismo orden, mismo resultado), el flujo habitual es **marcar como aplicadas** las migraciones que en la práctica ya están reflejadas, **sin** ejecutar de nuevo su SQL.

1. Seguir la guía oficial (actualizar según tu versión de Prisma):  
   [Baselining a database](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)

2. En muchos equipos, tras crear/rellenar `_prisma_migrations` según la doc, se usa:

   ```bash
   npx prisma migrate resolve --applied "<nombre_carpeta_migración>"
   ```

   Repetir **en orden cronológico** (mismo orden que las carpetas en `prisma/migrations/`) solo para migraciones que **ya** están aplicadas en esa base.

3. Luego:

   ```bash
   npx prisma migrate deploy
   ```

   Debería aplicar **solo** las migraciones pendientes (por ejemplo `add_mp_preference_id` si el resto ya estaba baselineado).

## Migraciones en este repo (referencia)

Orden típico de carpetas bajo `api/prisma/migrations/` (ver el árbol actual del proyecto):

- `0_init`
- `20260115182718_add_cliente_fields_and_producto_precio`
- `20260126140225_init`
- `20260219100000_add_cliente_usuario_pedido_relations`
- `20260219110000_add_pedido_forma_pago_envio_descuento`
- `20260401120000_checkout_sfactory_pedidos`
- `20260402120000_add_shipping_module`
- `20260403120000_add_mp_preference_id`

**Importante:** no marques como aplicada una migración cuyo SQL **no** se haya ejecutado nunca en esa base; si falta una columna o tabla, primero hay que alinear el esquema (SQL manual, `migrate diff`, o asesoría DBA).

## Si la BD no coincide con el historial

No uses `resolve --applied` a ciegas: compará el esquema real con `schema.prisma` (`prisma migrate diff`, introspection, o revisión manual) y corregí diferencias antes de baselinear.

## Alternativa solo para desarrollo local

En un entorno **desechable**, a veces se usa una BD vacía y `migrate deploy` end-to-end; eso **no** sustituye el baseline en producción/staging con datos.

## Ver también

- [`checkout-mp.md`](./checkout-mp.md) — columna `mp_preference_id` y flujo MP.
