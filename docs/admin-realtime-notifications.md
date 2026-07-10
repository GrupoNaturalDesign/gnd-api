# Admin realtime notifications

## Objetivo

La capa realtime informa cambios operativos de pedidos, stock y sincronizacion SFactory al panel admin sin convertir al socket en fuente de verdad. La fuente de verdad sigue siendo la base de datos local sincronizada contra SFactory; el frontend siempre revalida por API cuando recibe un evento.

## Arquitectura

1. Un servicio de dominio modifica un pedido, procesa un webhook, ejecuta un job o termina una sincronizacion.
2. El servicio llama a `adminNotificationService.createAndEmit()` o `notifyPedido()`.
3. La notificacion se persiste en `admin_notifications`.
4. Si hay un servidor Socket.IO inicializado, se emite `admin.notification.created` a la room `empresa:<empresaId>`.
5. El admin frontend invalida TanStack Query para dashboard, pedidos y notificaciones.
6. La campana vuelve a leer desde `/api/admin/notifications`, por lo que no se pierde informacion si el admin estaba desconectado.

## Persistencia

Tabla: `admin_notifications`

Campos principales:

- `empresaId`: tenant que recibe la notificacion.
- `type`: tipo estable del evento.
- `severity`: `info`, `success`, `warning` o `error`.
- `title` y `message`: texto visible para admin.
- `entityType` y `entityId`: entidad relacionada, por ejemplo `pedido` + id.
- `payload`: datos minimos para navegacion e invalidacion contextual.
- `readAt`: marca de lectura.
- `createdAt`: fecha de creacion.

Las notificaciones de errores repetidos se deduplican por `empresaId + type + entityId` si siguen no leidas dentro de una ventana de 15 minutos.

## Socket.IO

El servidor se inicializa en `src/index.ts` sobre el HTTP server de Express.

Modulo:

- `src/realtime/socket-server.ts`
- `src/realtime/socket-auth.ts`

Seguridad:

- El cliente envia Firebase ID token en `socket.handshake.auth.token`.
- Backend valida el token con Firebase Admin.
- Se exige rol `ADMIN`.
- Se resuelve `empresaId` con `empresaMiddleware` equivalente de SFactory auth.
- El socket solo entra a `empresa:<empresaId>`.

Evento emitido:

```ts
admin.notification.created
```

Payload: una fila `AdminNotification` completa.

## Endpoints admin

Todos usan `firebaseAuthMiddleware + requireAdmin + empresaMiddleware`.

- `GET /api/admin/notifications?limit=20&unreadOnly=false`
- `GET /api/admin/notifications/unread-count`
- `PATCH /api/admin/notifications/:id/read`
- `PATCH /api/admin/notifications/read-all`

## Tipos de eventos

- `pedido.created`: pedido web creado.
- `pedido.payment_approved`: Mercado Pago aprobo el pago.
- `pedido.status_changed`: cambio de estado relevante o confirmacion SFactory.
- `pedido.confirmation_required`: pedido manual pendiente de aprobacion.
- `pedido.sync_failed`: error de stock, payload, SFactory o webhook rechazado.
- `pedido.sync_recovered`: reintento SFactory exitoso.
- `pedido.cancelled`: pedido cancelado o anulado.
- `pedido.expired`: pedido manual vencido por job.
- `stock.critical`: stock critico agregado luego de sync SFactory.

Payload minimo para pedidos:

```json
{
  "pedidoId": 123,
  "estadoAnterior": "pendiente_pago",
  "estadoNuevo": "confirmado",
  "syncStatus": "synced",
  "sfactoryOrdenId": 456,
  "total": "10000",
  "clienteNombre": "Cliente Demo"
}
```

## Integracion frontend

Archivos principales:

- `src/app/services/realtime.service.ts`: cliente Socket.IO autenticado.
- `src/app/services/adminNotifications.service.ts`: API HTTP de historico y lectura.
- `src/app/hooks/useAdminRealtime.ts`: suscripcion e invalidacion de queries.
- `src/app/hooks/useAdminNotifications.ts`: listado, contador y mutaciones.
- `src/app/components/admin/AdminRealtimeProvider.tsx`: provider montado en layout admin.
- `src/components/admin/Header.tsx`: campana real con contador, dropdown y acciones.

Invalidaciones ante cada evento:

- `dashboardKeys.all`
- `pedidosKeys.all`
- `adminNotificationsKeys.all`

Solo se muestra toast para `warning` y `error`; eventos `info` y `success` quedan en la campana para no generar ruido.

## Variables

- `NEXT_PUBLIC_API_URL`: el cliente usa este valor y remueve `/api` para conectar Socket.IO.
- `CORS_ORIGIN`: origen permitido para HTTP y Socket.IO.
- `DASHBOARD_STOCK_CRITICO_MAX`: umbral de stock critico; default `5`.
- `PEDIDO_CHECKOUT_JOBS_ENABLED`: permite apagar jobs de pedidos si vale `false`.

## Prueba manual

1. Abrir `/admin/dashboard` y `/admin/pedidos` en dos pestanas.
2. Crear un pedido manual.
3. Confirmarlo o rechazarlo desde admin.
4. Simular un fallo SFactory o resolver un pedido fallido.
5. Ejecutar sync de stock.
6. Verificar que la campana, dashboard y tabla se actualizan sin refrescar.
7. Cerrar el admin, generar un evento y volver a abrir: la notificacion debe aparecer desde la DB.

