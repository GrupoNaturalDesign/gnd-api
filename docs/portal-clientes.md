# Portal Clientes — SSO por JWT

Acceso desde la tienda al **Portal de Clientes/Colaboradores** (`clientes.naturalonline.com.ar`). El acceso es **solo por AutoLogin con JWT**: no se linkea al login manual del portal.

> Estado: implementado (config, identidad, endpoint SSO, botón y menú de usuario). Pendiente: prueba punta a punta con el equipo del portal (ver checklist).

## Front (`client/`)

- `src/app/services/portalClientes.service.ts` — `obtenerLinkPortalClientes()` (exige `url` https) y `mensajeErrorPortalClientes()` (409/403/503 → mensajes para el usuario).
- `src/components/portal-clientes/usePortalClientesSso.ts` — pide el link **en el clic** y hace `window.location.assign`; evita doble clic y resetea el loading si se vuelve con "atrás" (bfcache). Errores por toast.
- `src/components/portal-clientes/PortalClientesButton.tsx` — `appearance="menu"` (ítem del menú de usuario) o `"button"` (design system).

401 lo maneja `apiClient` (redirige a login). El botón se muestra solo con sesión iniciada: está montado en `src/app/components/navbar/UserMenu.tsx`, entre "Mi perfil" y "Cerrar Sesión" (desktop y mobile).

## Checklist de prueba punta a punta

La URL de prueba es la de producción: acordar con el equipo del portal qué usuarios usar.

- [ ] Persona física cuyo email verificado coincide con un cliente con CUIL en nómina → entra directo a su panel.
- [ ] Cuenta con solo CUIT de empresa → 409; el contrato actualizado requiere identidad de colaborador.
- [ ] Colaborador con DNI que no está en nómina → pantalla de bloqueo de SSFI.
- [ ] Usuario sin CUIT asociado → toast de "No encontramos un CUIT/CUIL…" (409), sin redirigir.
- [ ] Copiar la URL con el token y abrirla después de 3 min → el portal rechaza el acceso.
- [ ] Sin `PORTAL_CLIENTES_JWT_SECRET` → toast "no está disponible" (503); la API sigue funcionando.
- [ ] Volver con "atrás" desde el portal → el ítem del menú no queda en estado cargando.

## Flujo

1. Usuario logueado en la tienda hace clic en **Portal Clientes** (menú de usuario; oculto sin sesión).
2. La API firma un JWT con la identidad del usuario.
3. El front redirige a `https://clientes.naturalonline.com.ar/ssfi/portal?token={JWT}`.
4. El portal valida firma, `exp`, `iss`, `aud` y busca en nómina por DNI/CUIL de colaborador. Si no está, muestra **Usuario No Registrado**.

## Variables de entorno (API)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PORTAL_CLIENTES_JWT_SECRET` | Sí | Secreto HS256 compartido con el equipo del portal (mín. 32 caracteres). Mismo valor para pruebas y producción. |
| `PORTAL_CLIENTES_URL` | No | URL base del portal. Default `https://clientes.naturalonline.com.ar`. |

Sin secreto (o con menos de 32 caracteres) la API arranca igual; solo el SSO queda deshabilitado. Config: `api/src/config/portal-clientes.config.ts`.

## Endpoint

`GET /api/portal-clientes/sso` — requiere `Authorization: Bearer <idToken Firebase>`. Rate limit: 30 / 15 min por IP. Respuesta con `Cache-Control: no-store`.

| Status | `code` | Cuándo |
|--------|--------|--------|
| 200 | — | `{ success: true, data: { url, expiresAt } }` — redirigir a `url` enseguida |
| 401 | — | Sin token o token Firebase inválido |
| 403 | `USUARIO_INACTIVO` | `usuarios.activo = false` |
| 404 | `USUARIO_NO_ENCONTRADO` | El `uid` no existe en `usuarios` |
| 409 | `IDENTIFICACION_REQUERIDA` | No hay CUIT/CUIL confiable para el usuario (ver abajo) |
| 503 | `PORTAL_NO_CONFIGURADO` | Falta `PORTAL_CLIENTES_JWT_SECRET` o es corto |

Archivos: `routes/portal-clientes.routes.ts` → `controllers/portal-clientes.controller.ts` → `services/portal-clientes.service.ts` → `utils/portal-clientes-token.util.ts` (firma, `jsonwebtoken`).

Logs (`[portal-clientes/sso]`): `usuarioId`, resultado, fuente y tipo (persona/empresa). **Nunca** el token, DNI ni CUIT.

## Contrato del token (acordado con el portal)

| Claim | Valor |
|-------|-------|
| `alg` (header) | `HS256` |
| `dni` | Solo dígitos, sin puntos ni ceros iniciales. Ausente en empresas. |
| `cuit` | 11 dígitos, opcional. Lo usa el portal para validar empresas cliente. |
| `email` | Email del usuario en la tienda. |
| `iat` / `exp` | `exp` = `iat` + **180 s** (se genera al hacer clic). |
| `iss` | `naturalonline.com.ar` |
| `aud` | `SSFI-PORTAL` |
| `jti` | UUID por token. SSFI debe impedir reuso; verificarlo en la prueba integral. |

## Origen de DNI / CUIT

Ni `usuarios` ni S-Factory tienen campo DNI: la única fuente es el CUIT/CUIL (`clientes.cuit` o `tax_id` de S-Factory). Lógica en `api/src/utils/portal-identidad.util.ts` (`resolverIdentidadPortal`):

| Entrada (se ignoran guiones, puntos y espacios) | Claims |
|-------------------------------------------------|--------|
| CUIL persona física (`20`, `23`, `24`, `27`) | `dni` = 8 dígitos centrales + `cuit` |
| CUIT empresa (`30`, `33`, `34`) | Identidad sin DNI: SSO devuelve 409 |
| DNI suelto de 7–8 dígitos | solo `dni` |
| Vacío / otro prefijo / otro largo | `null` → no se genera token |

### De dónde sale el CUIT del usuario (en orden)

1. `clientes.cuit` del cliente vinculado (`clientes.usuario_id`).
2. `usuarios.sfactory_cliente_id` → `clientes.sfactory_id` → `cuit`.
3. Si `usuarios.email_verified = true`: clientes activos con el **mismo email**. Solo si todos resuelven a la misma identidad (`resolverIdentidadUnica`).

Si ninguna da resultado → `409 IDENTIFICACION_REQUERIDA`.

**Ojo:** hoy ningún flujo del código escribe `clientes.usuario_id` ni `usuarios.sfactory_cliente_id`, así que en la práctica la fuente principal es la 3 (email verificado igual al email del cliente en S-Factory). Si hay muchos 409, el próximo paso es vincular usuarios con clientes (por admin o por proceso), no aceptar CUIT tipeado.

## Decisiones

- **DNI sin ceros iniciales.** Un DNI de 7 dígitos aparece en el CUIL con un cero de relleno (`20-06123456-3`); se envía `"6123456"`, no `"06123456"`. Motivo: el DNI es un número y el portal pidió "solo dígitos"; las nóminas y ERPs lo guardan sin relleno. Si el portal lo espera con 8 dígitos, el cambio es solo en `normalizarDni`.
- **Sin validación del dígito verificador del CUIT.** Un CUIT mal cargado no matchea en nómina y el portal muestra Usuario No Registrado; rechazarlo de nuestro lado no agrega seguridad.
- **Prevención de replay en SSFI.** GND emite un UUID distinto por token. SSFI debe registrar los `jti` consumidos y rechazar un segundo ingreso; pendiente de prueba integral.
- **Sin entorno de prueba separado.** La URL de prueba es la de producción: coordinar usuarios de prueba con el equipo del portal.
- **Solo fuentes de CUIT que el usuario no puede editar.** El portal da acceso por DNI: aceptar un CUIT tipeado (perfil o `pedidos.factura_cuit`) permitiría entrar al panel de otra persona. Por eso no se usa `factura_cuit` (puede ser de un tercero) y el email solo cuenta si está verificado en Firebase.
- **Email con varios clientes distintos → no se elige.** Si el mismo email está en clientes con CUIT diferentes, se devuelve 409 en vez de adivinar.
- **Solo base local, sin llamar a S-Factory al hacer clic.** `clientes` ya se sincroniza desde S-Factory; evita latencia y fallas de la API externa en el botón.
- **`jsonwebtoken` en vez de `jose`.** La API es CommonJS y `jose` v6 es solo ESM. `jsonwebtoken` ya venía como dependencia transitiva de `firebase-admin`.

## Tests

- `api/tests/portal-identidad.util.test.ts` — CUIT → `dni`/`cuit` y regla de candidatos múltiples.
- `api/tests/portal-clientes-token.util.test.ts` — claims, `exp` = 180 s, `jti` único, firma inválida/vencida, URL.

Ambos incluidos en `npm test`.

## Contrato SSFI actualizado — 8 de octubre de 2026

Audience: `SSFI-PORTAL`. Issuer enviado: `naturalonline.com.ar` (confirmar su allowlist con SSFI). URL: `/ssfi/portal`. No se consulta `verify-dni`: SSFI valida la nómina al recibir el JWT. El contrato requiere DNI o CUIL de colaborador; el acceso por CUIT de empresa sin DNI queda pendiente de confirmación y no genera token.
