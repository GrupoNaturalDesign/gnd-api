# Auth: setup de base de datos

## Schema

Se agregaron:

- **Tabla `roles`**: códigos `ADMIN` y `USER`.
- **Tabla `auth_tokens`**: tokens de verificación de email y de reset de contraseña.
- **En `usuarios`**: `password_hash`, `is_system_user`, `email_verified`, `role_id`, y el campo Prisma `externalId` (columna `auth0_user_id` se mantiene).

## Aplicar cambios

Si usás migraciones y hay drift, podés:

1. **Sincronizar sin migraciones (solo desarrollo):**
   ```bash
   npm run prisma:push
   ```

2. **Crear y aplicar una migración** a mano para estas tablas/columnas si no querés hacer reset.

## Seed de roles

Después de tener las tablas:

```bash
npm run prisma:seed
```

Crea los roles `ADMIN` y `USER` en la tabla `roles`.

## Endpoints de auth

- `POST /api/auth/register` – Registro (email, password, nombre, etc.).
- `POST /api/auth/forgot-password` – Solicitar reset (body: `{ email }`).
- `POST /api/auth/reset-password` – Restablecer contraseña (body: `{ token, newPassword }`).
- `GET|POST /api/auth/verify-email` – Verificar email (`?token=...` o body `{ token }`).
- `POST /api/auth/credentials` – Validar email/password (para Auth.js).
- `POST /api/auth/google` – Find/create user desde perfil Google (para Auth.js).
