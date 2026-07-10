# Emails — Sistema de envío con Resend

## Overview

Envío de emails transaccionales y marketing via [Resend](https://resend.com). Usa `@react-email/components` para renderizar templates React a HTML.

## Templates

| Archivo | Uso | Destinatario |
|---------|-----|--------------|
| `WelcomeEmail.tsx` | Registro de usuario nuevo | Cliente |
| `OrderStatusEmail.tsx` | Cambio de estado de pedido | Cliente |
| `ContactConfirmationEmail.tsx` | Formulario de contacto (cliente + equipo) | Cliente + Ventas |
| `InternalOrderNotification.tsx` | Nuevo pedido para el equipo | Interno |
| `NewsletterEmail.tsx` | Newsletter/marketing enviado desde admin | Lista de clientes |
| `BaseLayout.tsx` | Wrapper común (header logo, footer, WhatsApp) | — |
| `order-status-ui.ts` | Textos/iconos por estado de pedido | — |

## Servicio

`src/lib/email/email.service.ts` — `emailService`

| Método | Tipo | Descripción |
|--------|------|-------------|
| `sendWelcomeEmail` | Transaccional | Bienvenida a nuevo usuario |
| `sendOrderStatusEmail` | Transaccional | Notificación de estado de pedido |
| `sendContactConfirmation` | Transaccional | Confirma consulta al cliente + notifica a ventas |
| `sendInternalOrderNotification` | Interno | Alerta al equipo por nuevo pedido |
| `sendNewsletter` | Marketing | Newsletter desde panel admin |

Pedidos checkout: `pedido-email-notification.service.ts` dispara `sendOrderStatusEmail` en confirmación (`CONFIRMED`), cancelación y vencimiento sin pago (`CANCELLED`). Ver [checkout-pedidos-estados.md](./checkout-pedidos-estados.md).

## Versiones HTML y texto plano

Todos los emails se envían con ambas versiones (`html` + `text`). La versión texto plano se genera automáticamente desde el HTML con `render(..., { toPlainText: true })` usando `html-to-text`. Esto mejora la entregabilidad en clientes de correo que bloquean HTML y cumple requisitos de accesibilidad.

## Newsletter — Batch Sending y Unsubscribe

`sendNewsletter` usa `resend.batch.send()` en lugar de `resend.emails.send()` individuales.

**Límites de Resend batch:**
- Máximo 100 emails por llamada al endpoint `/emails/batch`
- El body del HTML se renderiza una vez por destinatario (mismo contenido)

**Flujo completo:**
1. Filtra destinatarios contra `UnsubscribeToken` (desuscriptos se omiten)
2. Genera o recupera token de desuscripción por email (`unsubscribeService.createOrGetToken`)
3. Renderiza HTML y texto plano por destinatario (con link de unsubscribe personalizado)
4. Divide la lista en chunks de 100
5. Envía cada chunk con `resend.batch.send()`
6. Cada email se loguea individualmente en `EmailLog`
7. Si un chunk falla, se loguean los errores y se continúa con los siguientes

**Link de desuscripción:** Cada newsletter incluye un link `unsubscribeToken` único por destinatario que apunta a `GET /api/emails/unsubscribe/:token` (público, sin auth).

**Idempotencia:** Cada chunk usa una key única `newsletter-{timestamp}/chunk-{idx}` (24h de vigencia en Resend).

**Retorno:**
```ts
{ success: true, messageId: string }                                        // todo ok
{ success: true, messageId, error: "X desuscriptos, omitidos." }            // partial
{ success: false, error: string }                                           // todo falló
{ success: true, error: "Todos los N destinatarios están desuscriptos." }   // nada que enviar
```

## Logging

Todos los envíos se registran en `prisma.emailLog`:
- `type`: `welcome | order_status | contact | newsletter | internal`
- `status`: `sent | failed`
- `messageId`: ID de Resend
- `metadata`: datos adicionales (subject, orderId, chunk, etc.)
- `error`: mensaje de error si falló

Si el logging falla, el error se imprime en consola pero no interrumpe el envío.

## Unsubscribe

### Servicio (`unsubscribeService`)

```ts
// Crea o recupera token para un email
createOrGetToken(email: string): Promise<string>

// true si está desuscripto
isUnsubscribed(email: string): Promise<boolean>

// Filtra una lista de emails (quita los desuscriptos)
filterUnsubscribed(emails: string[]): Promise<string[]>

// Confirma la desuscripción (borra el token)
unsubscribe(token: string): Promise<{ success: boolean; message: string }>
```

### Endpoint público

```
GET /api/emails/unsubscribe/:token
```

- Token válido → elimina el registro, retorna `success: true`
- Token inválido → 404 `success: false`

### Modelo Prisma

```prisma
model UnsubscribeToken {
  id        String   @id @default(cuid())
  email     String   @db.VarChar(255)
  token     String   @unique @db.VarChar(64)
  createdAt DateTime @default(now())

  @@index([email])
  @@index([token])
}
```

## Variables de entorno

```env
# --- Resend (requerido para todos los emails) ---
RESEND_API_KEY=re_xxxxxxxxxxxx

# Dirección "From" para emails transaccionales
# Formato: "Nombre Mostrado <pedidos@tudominio.com>"
RESEND_FROM_TRANSACTIONAL="GND Natural Design <pedidos@tudominio.com>"

# Dirección "From" para newsletters/marketing
RESEND_FROM_MARKETING="GND Natural Design <novedades@tudominio.com>"

# Destinatario de notificaciones internas de pedidos
RESEND_INTERNAL_TO=ventas@tudominio.com

# Destinatario de consultas de contacto (fallback)
RESEND_CONTACT_INTERNAL_TO=ventas@tudominio.com

# --- Brand (opcional si ya están en email-brand.ts) ---
BRAND_LOGO_URL=https://tudominio.com/logos/logo.svg
BRAND_WHATSAPP_DIGITS=5491111111111

# URL base del frontend para link de unsubscribe en newsletters
NEWSLETTER_UNSUBSCRIBE_BASE_URL=https://naturalonline.com.ar
```

**Dominios verificados:** Los dominios usados en `RESEND_FROM_*` deben estar verificados en el [dashboard de Resend](https://resend.com/domains). Sin verificación, los emails no se envían.

## Retry con exponential backoff

`sendWithRetry` envuelve los llamados a Resend con reintentos automáticos para errores transitorios.

**Errores reintentados:** `statusCode >= 500` (5xx server errors) y `429` (rate limit).

**Errores NO reintentados:** `400`, `401`, `403`, `422`, `409` (son errores del cliente que requieren corrección, no reintento).

**Backoff:** exponencial con jitter — 1s → 2s → 4s (máximo 30s), más 0-500ms aleatorio para evitar thundering herd.

**Reintentos por método:**

| Método | Max retries |
|--------|-----------|
| `sendWelcomeEmail` | 3 (default) |
| `sendOrderStatusEmail` | 3 (default) |
| `sendContactConfirmation` | 3 (default) |
| `sendInternalOrderNotification` | 3 (default) |
| `sendNewsletter` (batch) | 2 por chunk |

**Logs:** cada intento fallido se loguea con warning en consola, indicando el nombre del método, intento, error y delay antes del reintento.

## Flujo de errores

1. Si `RESEND_API_KEY` o `from` no están definidos → retorna `{ success: false, error: '...' }` sin lanzar
2. Si Resend retorna `error` en la respuesta → `sendWithRetry` reintenta automáticamente (solo si es 5xx/429)
3. Después de agotar reintentos → loguea en `EmailLog` y retorna el error
4. Si ocurre una excepción no manejada → loguea y retorna el mensaje de error

## Tests

```bash
npm test -- tests/email/
```

Archivos:
- `newsletter-batch.test.ts` — envío batch, chunks de 100, idempotency keys, filtro unsubscribe
- `email-service-welcome.test.ts` — envío, errores, retry
- `email-service-order-status.test.ts` — envío con estados, retry, rate limits
- `email-service-contact.test.ts` — email dual (cliente + equipo), casos de éxito/parcial/fallo
- `email-service-internal.test.ts` — notificación interna, errores de config
- `email-retry.test.ts` — isRetryableResendError, exponential backoff, recuperación
- `email-unsubscribe.test.ts` — servicio unsubscribe + controller endpoint

## Roadmap de mejoras

- [x] Agregar versión texto plano (`text`) a todos los templates
- [x] Link de unsubscribe en newsletter (con token en BD)
- [ ] Template "Olvidé mi contraseña" (gestionado por Firebase)
- [x] Retry con exponential backoff para errores 5xx
- [x] Tests para todos los métodos del email service