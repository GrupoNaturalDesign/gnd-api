# QA operativo — checkout unificado

**Regla:** Confirmar pedido → stock reservado, **sin S-Factory**.  
SF solo tras **pago MP** o **aprobación admin**.

**Entorno:** `INTEGRATIONS_ENV=test`, `PEDIDO_CHECKOUT_JOBS_ENABLED=true`, producto con stock conocido.

Ver flujo completo: [checkout-pedido-lifecycle.md](./checkout-pedido-lifecycle.md).

---

## Caso 1 — Transferencia / efectivo

| Paso | Acción | Verificar |
|------|--------|-----------|
| 1 | Confirmar pedido en web | `pendiente_confirmacion`, `stock_reservado_web=true`, `sfactory_orden_id=null` |
| 2 | Mirar stock del SKU | Bajó en web |
| 3 | Mirar S-Factory | **No** hay PE `WEB-<id>` |
| 4 | Admin → Aprobar | `confirmado`, `sfactory_orden_id` con valor, PE en SF |
| 5 | Totales | `subtotal`/`total` locales **no cambiaron** por SF |

---

## Caso 1b — Manual + envío postal (Andreani/Correo)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 1 | Checkout: **envío** + transferencia/efectivo, confirmar | `pendiente_confirmacion`, `checkout_envio_snapshot` con provider, `costo_envio` > 0, **sin** `sfactory_orden_id`, **sin** tracking |
| 2 | Antes de aprobar | No hay orden en Andreani/Correo (`andreani_numero_envio` / `correo_tracking_number` null) |
| 3 | Admin → Aprobar | `confirmado`, PE en SF, **se crea envío** en carrier (tracking en pedido o job de reintento) |
| 4 | Email cliente | `CONFIRMED` tras aprobación |

Test automatizado: `api/tests/checkout/manual-shipping-lifecycle.test.ts`.

---

## Caso 2 — Mercado Pago (transfer)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 1 | Checkout MP, modo **transfer**, confirmar | `pendiente_pago`, stock reservado, **sin SF** |
| 2 | Preferencia MP | Monto = precios **transfer** − cupón + envío |
| 3 | Pagar en sandbox | Webhook `approved` |
| 4 | Post-pago | `confirmado` + PE en SF |

---

## Caso 3 — Mercado Pago (financiado)

Igual que Caso 2, con modo **financiado** y precios **lista**.

---

## Caso 4 — Sin stock

Confirmar con cantidad > disponible → `fallido`, sin reserva, sin PE en SF.

---

## Caso 5 — Doble compra mismo SKU

Dos pedidos casi juntos → el segundo falla o no puede reservar lo ya comprometido.

---

## Caso 5b — Doble click en confirmar

Doble click rápido en **CONFIRMAR** (MP o manual) → un solo pedido creado; el botón queda deshabilitado mientras procesa.

---

## Caso 6 — Vencimiento sin pago

Dejar pedido impago pasado `expires_at` (job activo; en staging bajar `CHECKOUT_PEDIDO_EXPIRES_HOURS=1`).

→ `cancelado`, stock devuelto, **sin** PE nueva en SF.

---

## Caso 6b — Aviso previo al vencimiento

Con pedido en `pendiente_pago` o `pendiente_confirmacion` y `expires_at` dentro de `CHECKOUT_EXPIRY_WARNING_HOURS` (default 12 h):

| Destino | Verificar |
|---------|-----------|
| Admin | Notificación `pedido.expiring_soon` en dashboard |
| Cliente | Email `order_expiring_soon` a `cliente_email` (máx. 1 cada 24 h por pedido) |
| Checkout (pre-pedido) | `GET /api/checkout/config-tienda` expone `pagoManualHorasPlazo`, `mpExpiresHours`; copy en paso pago |

---

## Caso 7 — Rechazo admin

Manual pendiente → Admin rechaza → `cancelado`, stock devuelto.

---

## Caso 8 — MiCorreo: integrador vs cuenta portal

Escenario: cuenta **Vinculada** en Envíos pero cotización en checkout falla.

| Paso | Acción | Verificar |
|------|--------|-----------|
| 1 | Admin → Integraciones | MiCorreo: capa **API integrador** en error; cuenta portal puede estar OK |
| 2 | `GET /api/admin/empresa/envio-config/micorreo/health` | `integrator.status: error`, `account.status: ok`, `readyForCheckout: false` |
| 3 | `POST /api/checkout/shipping/quote` (correo) | 503, `code: MICORREO_INTEGRATOR_UNAUTHORIZED` (no 500 genérico) |
| 4 | Postman `POST .../micorreo/v1/token` con `CORREO_*_PROD` | 401 → pedir credenciales integrador prod a Correo Argentino |
| 5 | Tras corregir env en Vercel | Integraciones: integrador OK, `readyForCheckout: true`; quote responde 200 |

Ver [micorreo-health.md](./micorreo-health.md).

---

## Dashboard

- Pendientes de confirmar
- Próximos a vencer
- Errores S-Factory
- (Opcional) `pedido.price_divergence` si SF audita distinto total

---

## SQL rápido

```sql
SELECT id, estado_interno, stock_reservado_web, sfactory_orden_id, subtotal, total, expires_at
FROM pedidos WHERE id = ?;
```
