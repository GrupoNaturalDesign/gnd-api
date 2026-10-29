# Portal Clientes — SSO por JWT

Acceso desde la tienda al **Portal de Clientes/Colaboradores** (`clientes.naturalonline.com.ar`). El acceso es **solo por AutoLogin con JWT**: no se linkea al login manual del portal.

> Estado: implementado. La tienda verifica y vincula el DNI antes de emitir JWT; SSFI verifica la nómina al recibirlo. Pendiente: prueba punta a punta con el equipo del portal (ver checklist).

## Front (`client/`)

- `src/app/services/portalClientes.service.ts` — `obtenerLinkPortalClientes()` (exige `url` https) y `mensajeErrorPortalClientes()` (409/403/503 → mensajes para el usuario).
- `src/components/portal-clientes/usePortalClientesSso.ts` — pide el link **en el clic** y hace `window.location.assign`; evita doble clic y resetea el loading si se vuelve con "atrás" (bfcache). Errores por toast.
- `src/components/portal-clientes/PortalClientesButton.tsx` — `appearance="menu"` (ítem del menú de usuario) o `"button"` (design system).

401 lo maneja `apiClient` (redirige a login). El botón se muestra solo con sesión iniciada: está montado en `src/app/components/navbar/UserMenu.tsx`, entre "Mi perfil" y "Cerrar Sesión" (desktop y mobile).

## Checklist de prueba punta a punta

La prueba de handshake debe hacerse primero desde un entorno de staging acordado con SSFI; reservar producción para el OK final.

- [ ] Persona física cuyo email verificado coincide con un cliente con CUIL en nómina → entra directo a su panel.
- [ ] Cuenta con solo CUIT de empresa → 409; el contrato actualizado requiere identidad de colaborador.
- [ ] Colaborador con DNI que no está en nómina → pantalla de bloqueo de SSFI.
- [ ] Usuario sin identidad asociada → se deriva a `/portal-clientes`, solicita DNI/CUIL y queda pendiente sin acceso hasta aprobación admin.
- [ ] Administrador aprueba o rechaza desde Admin → Vinculaciones; el usuario recibe email en su correo verificado y puede consultar el estado y motivo en `/portal-clientes`.
- [ ] SSFI consume el `jti`: volver a abrir el mismo enlace/token falla y un token nuevo funciona.
- [ ] En staging, un usuario autorizado entra a su catálogo y cupos; un usuario fuera de nómina ve el mensaje de SSFI confirmado por el equipo.
- [ ] Copiar la URL con el token y abrirla después de 3 min → el portal rechaza el acceso.
- [ ] Sin `PORTAL_CLIENTES_JWT_SECRET` → toast "no está disponible" (503); la API sigue funcionando.
- [ ] Volver con "atrás" desde el portal → el ítem del menú no queda en estado cargando.

### Preflight de producción antes de la prueba final

- Publicar la versión actual de API y frontend; ambos builds locales deben terminar correctamente.
- En Hostinger, revisar que `.env` tenga `PORTAL_CLIENTES_JWT_SECRET` con al menos 32 caracteres y que el valor coincida exactamente con SSFI. `PORTAL_CLIENTES_URL` puede omitirse para usar el dominio oficial; si se define, debe ser `https://clientes.naturalonline.com.ar`.
- Confirmar `RESEND_API_KEY` y `RESEND_FROM_TRANSACTIONAL` para avisos de aprobación/rechazo.
- Aplicar/verificar la tabla `portal_identidades` en producción con `python scripts/ssh-hostinger-prisma-deploy.py` desde `api/` (requiere `HOSTINGER_SSH_PASSWORD`). El script aplica la migración SQL en la DB de Hostinger y sincroniza el Prisma Client.
- Confirmar con SSFI el usuario de prueba autorizado. No guardar DNI ni correo de prueba en el repositorio; recibirlos por canal acordado y usarlos solo con autorización.

### Preparación de staging

- La generación JWT no depende del dominio de producción: `PORTAL_CLIENTES_URL` cambia el host base y el código agrega `/ssfi/login`. El valor se configura en el entorno del backend de staging; el default apunta al dominio oficial de producción.
- El repo no define por sí solo una instancia de staging ni sus credenciales. Antes del handshake debe existir un backend y frontend de staging aislados de producción, con sus propias variables y base de datos.
- Configurar `PORTAL_CLIENTES_JWT_SECRET` por canal seguro con SSFI. La clave debe coincidir entre el backend y el verificador SSFI del mismo entorno y tener al menos 32 caracteres. Usar una clave distinta en producción si SSFI provisiona claves separadas.
- Mantener `iss=naturalonline.com.ar`, `aud=SSFI-PORTAL`, `HS256`, `exp=iat+180 s`; configurar `PORTAL_CLIENTES_URL` al host de staging que SSFI indique.
- Crear/verificar en la tienda de staging un usuario con email verificado y vinculación de DNI aprobada por administrador. SSFI provee una identidad autorizada y una fuera de nómina por canal seguro.

## Flujo

1. Usuario logueado en la tienda hace clic en **Portal Clientes** (menú de usuario; oculto sin sesión).
2. Si la identidad no está vinculada, la tienda solicita el DNI/CUIL dentro de `/portal-clientes`; un administrador confirma titularidad con la empresa/RR. HH. en Admin → Vinculaciones. El usuario recibe por email la decisión y su motivo.
3. Con la identidad aprobada (o una fuente confiable ya vinculada), el clic pide el JWT a la API.
4. El front redirige a `https://clientes.naturalonline.com.ar/ssfi/login?token={JWT}`.
5. El portal valida firma, `exp`, `iss`, `aud` y busca en nómina por DNI de colaborador. Si no está, muestra su mensaje de campaña.

## Variables de entorno (API)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `PORTAL_CLIENTES_JWT_SECRET` | Sí | Secreto HS256 compartido por entorno con SSFI (mín. 32 caracteres); configurar por canal seguro. |
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
| `jti` | UUID único por token. SSFI confirmó que lo consume y rechaza su reutilización. |

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
- **Prevención de replay en SSFI.** GND emite un UUID distinto por token. SSFI confirmó que cada `jti` es de un solo uso; verificarlo en el handshake.
- **Staging.** `PORTAL_CLIENTES_URL` permite cambiar el host base. La instancia aislada de GND staging y la URL/clave de SSFI staging deben aprovisionarse antes de la prueba; no apuntar staging a producción accidentalmente.
- **Solo fuentes de CUIT que el usuario no puede editar.** El portal da acceso por DNI: aceptar un CUIT tipeado (perfil o `pedidos.factura_cuit`) permitiría entrar al panel de otra persona. Por eso no se usa `factura_cuit` (puede ser de un tercero) y el email solo cuenta si está verificado en Firebase.
- **Email con varios clientes distintos → no se elige.** Si el mismo email está en clientes con CUIT diferentes, se devuelve 409 en vez de adivinar.
- **Solo base local, sin llamar a S-Factory al hacer clic.** `clientes` ya se sincroniza desde S-Factory; evita latencia y fallas de la API externa en el botón.
- **`jsonwebtoken` en vez de `jose`.** La API es CommonJS y `jose` v6 es solo ESM. `jsonwebtoken` ya venía como dependencia transitiva de `firebase-admin`.

## Tests

- `api/tests/portal-identidad.util.test.ts` — CUIT → `dni`/`cuit` y regla de candidatos múltiples.
- `api/tests/portal-clientes-token.util.test.ts` — claims, `exp` = 180 s, `jti` único, firma inválida/vencida, URL.

Ambos incluidos en `npm test`.

## Contrato SSFI confirmado — 13 de octubre de 2026

Endpoint oficial: `https://clientes.naturalonline.com.ar/ssfi/login?token={JWT}`. SSFI confirmó `HS256`, `iss=naturalonline.com.ar`, `aud=SSFI-PORTAL`, `exp=iat+180 s`, `dni` numérico sin ceros iniciales (7 u 8 dígitos), `email` y `jti` único de un solo uso. El secreto se coordina por canal seguro. El dominio Firebase es infraestructura interna. SSFI valida la nómina al recibir el JWT; GND verifica la titularidad y vincula el DNI antes de emitirlo. Para la persona fuera de nómina, SSFI confirmó el mensaje: “El DNI ingresado no figura en la nómina activa de la campaña vigente. Contacte a RRHH de su empresa”.

## Vinculación con aprobación administrativa

- Cliente: `/portal-clientes`. Si falta identidad, solicita DNI/CUIL y exige email verificado. La solicitud no da acceso por sí sola.
- API cliente: `GET/POST /api/portal-clientes/identidad`. El POST guarda únicamente una solicitud pendiente y nunca modifica una aprobación existente.
- Administrador: `/admin/portal-clientes` (Admin → Vinculaciones), accesible desde el menú admin. Permite revisar las últimas 100 solicitudes o vincular por email una cuenta existente. Antes de aprobar, el administrador confirma con la empresa/RR. HH. y registra motivo y fuente de verificación; también puede rechazar o revocar.
- API admin: `GET/POST /api/admin/portal-clientes`, protegida por Firebase, rol admin y alcance de empresa. Cada decisión exige motivo y confirmación explícita de verificación.
- Tabla: `portal_identidades`, separada del catálogo y de los clientes sincronizados. Estados: pendiente, aprobado, rechazado. `dni_verificado` solo se escribe al aprobar y es único. Las solicitudes pendientes/rechazadas no firman tokens y prevalecen sobre otras fuentes para evitar bypass de revocaciones.
- El documento no se copia al log global de auditoría; la tabla conserva responsable, motivo y fecha de la última decisión.
- Deploy: aplicar `migrations/add_portal_identidades.sql` (CREATE TABLE IF NOT EXISTS) y sincronizar Prisma Client con `python scripts/ssh-hostinger-prisma-deploy.py` antes de probar en producción. Requiere `HOSTINGER_SSH_PASSWORD` y acceso SSH.
- Cuenta de prueba: usar las identidades autorizadas que SSFI entregue para staging; mantener DNI y correo fuera de esta documentación. El administrador debe aprobar el DNI en la cuenta de staging, con email verificado. No se modifica el rol.
- Notificación de decisión: al aprobar o rechazar, se envía email al correo verificado de la cuenta con el resultado, motivo y enlace al estado. La pantalla `/portal-clientes` también muestra el rechazo y su motivo; se omiten números con formato de DNI/CUIT en el correo. Se registra el envío en `email_logs` con tipo `portal_identity`; requiere `RESEND_API_KEY` y `RESEND_FROM_TRANSACTIONAL`.
- Para datos reales, confirmar la titularidad con empresa/RRHH antes de aprobar. No se implementó OTP de SSFI ni se consulta `verify-dni`. El CUIT/CUIL opcional en registro queda fuera de esta entrega; los datos se solicitan al intentar entrar al portal.
