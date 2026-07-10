# Empresa por defecto

La API usa **SFACTORY_COMPANY_KEY** (en `api/.env`) para resolver el `empresaId` en las rutas que tienen `empresaMiddleware` (productos, rubros, clientes, etc.). Si en la base de datos **no existe** ninguna fila en `empresas` con ese `sfactory_company_key` y `activa = 1`, esas rutas responden **500** o "Empresa no encontrada".

## Cómo dejar la empresa fija

1. **Revisá tu `.env`** y anotá el valor de `SFACTORY_COMPANY_KEY` (ej: `867c09d0bb9a7e9ac0c93e1747352d8d`).

2. **Ejecutá el script SQL** que inserta (o actualiza) la empresa con ese key:
   - Archivo: `api/prisma/scripts/insert-empresa-default.sql`
   - En MySQL/MariaDB: desde la consola o desde tu cliente (HeidiSQL, DBeaver, etc.):
     ```bash
     mysql -u USUARIO -p NOMBRE_BD < api/prisma/scripts/insert-empresa-default.sql
     ```
   - O abrí el `.sql`, **reemplazá** `@sfactory_company_key` si tu key es otro, y ejecutá el contenido en tu DB.

3. **Verificación**: debería existir una fila en `empresas` con `sfactory_company_key` = tu key y `activa = 1`. Los endpoints que dependen de empresa dejarán de devolver 500.

## Valores del INSERT

El script inserta (o actualiza por `codigo` si ya existe) una empresa con:

- **codigo**: `NDTS`
- **nombre**: `Natural Design`
- **razon_social**: `Natural Design S.A.`
- **sfactory_company_key**: el valor de tu `.env` (variable al inicio del script)
- **activa**: `1`

Podés editar `insert-empresa-default.sql` para cambiar nombre, razón social o código; lo importante es que **sfactory_company_key** coincida con `SFACTORY_COMPANY_KEY` del `.env`.

## Resumen

| Qué | Dónde |
|-----|--------|
| Key que usa la API | `api/.env` → `SFACTORY_COMPANY_KEY` |
| Script INSERT empresa | `api/prisma/scripts/insert-empresa-default.sql` |
| Tabla | `empresas` |

Con la empresa creada/actualizada, ya no deberías ver errores de "Empresa no encontrada" ni 500 en productos/destacados/publicados por falta de empresa.
