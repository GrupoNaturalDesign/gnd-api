# Meta Pixel — tienda web

Integración **client-side** del Meta (Facebook) Pixel en el frontend Next.js (`client/`). Sirve para medir tráfico y conversiones de campañas de anuncios en `naturalonline.com.ar`.

**Pixel ID del cliente:** `664659926047255`

El código en `client/src/app/analytics/metaPixel/` prevalece sobre este resumen.

---

## Arquitectura

```
client/src/app/analytics/metaPixel/
├── metaPixel.config.ts       # Pixel ID y enable/disable por env
├── metaPixel.types.ts        # Tipos y constantes
├── metaPixel.mappers.ts      # CartItem → payload Meta
├── metaPixel.client.ts       # Wrapper fbq() + deduplicación
├── MetaPixelScript.tsx       # Carga del script base
├── MetaPixelRouteTracker.tsx # PageView en navegación SPA
└── metaPixel.mappers.test.ts # Tests unitarios
```

**Montaje global** en `client/src/app/components/Providers.tsx`:

- `MetaPixelScript` — `fbq('init')` + primer `PageView`
- `MetaPixelRouteTracker` — `PageView` en cambios de ruta (App Router / SPA)

Convive con **GTM** (`GTM-NB3MKBCM`) y **Google Ads** (`AW-17610803161`) en `client/src/app/layout.tsx`. **No duplicar el pixel en GTM** para evitar doble conteo.

No hay **Conversions API (CAPI)** en el backend por ahora.

---

## Variables de entorno

En `client/.env.local` (plantilla en `client/.env.example`):

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_META_PIXEL_ID` | ID del pixel. En producción sin env explícito usa `664659926047255` |
| `NEXT_PUBLIC_META_PIXEL_ENABLED` | `false` o `0` para desactivar |

**Producción sin env:** pixel activo con ID por defecto `664659926047255`.

**Local para probar:**

```env
NEXT_PUBLIC_META_PIXEL_ID=664659926047255
NEXT_PUBLIC_META_PIXEL_ENABLED=true
```

**Local sin env:** el pixel queda desactivado (no hay ID fuera de `NODE_ENV=production`).

---

## Eventos implementados

| Evento Meta | Cuándo | Dónde en código |
|-------------|--------|-----------------|
| `PageView` | Carga inicial + navegación SPA | `MetaPixelScript`, `MetaPixelRouteTracker` |
| `ViewContent` | Vista de ficha de producto | `ProductDetailPageContent.tsx` |
| `AddToCart` | Agregar al carrito (éxito) | `cartStore.ts` → `addItem` |
| `InitiateCheckout` | Entrada a `/checkout/pedido` con ítems | `checkout/layout.tsx` (1× por sesión) |
| `AddPaymentInfo` | Confirmar pedido en step 4 | `CheckoutStep4.tsx` |
| `Purchase` | **Solo Mercado Pago aprobado** | `checkout/pago-resultado/page.tsx` |
| `PedidoCreado` (custom) | Transferencia/efectivo, pedido creado | `checkout/instrucciones-pago/page.tsx` |

- Moneda: **ARS**
- `content_ids`: preferencia por `product.codigo`, fallback `String(product.id)`

---

## Flujos de conversión

### Mercado Pago

1. Cliente confirma en step 4 → `AddPaymentInfo` + snapshot con analytics en `sessionStorage`
2. Redirige a Mercado Pago
3. Vuelve con pago aprobado → `Purchase` con `eventID: pedido_{id}` (dedupe si refresca la página)

### Transferencia / efectivo

1. Cliente confirma → `AddPaymentInfo` + snapshot manual con analytics
2. Llega a instrucciones de pago → `PedidoCreado` (**no** `Purchase`)
3. Admin confirma el pago en el panel → **sin evento Meta** (el pixel corre en el browser del cliente, no del admin)

### Admin

- El script se carga también en rutas admin (mismo `Providers`), pero **no se disparan eventos** al confirmar pedidos.
- Pedidos MP en `pendiente_pago` no se confirman manualmente desde admin; se confirman al acreditarse el pago.

---

## Snapshots de checkout

Para enviar líneas y total en `Purchase` / `PedidoCreado`:

| Snapshot | Archivo | Campo |
|----------|---------|--------|
| MP | `checkoutMp.service.ts` | `CheckoutMpSnapshot.analytics` |
| Manual | `checkoutManual.service.ts` | `CheckoutManualSnapshot.analytics` |

Se persisten al crear el pedido en `CheckoutStep4` / `useCheckoutMpPayment` mediante `buildMetaPixelAnalyticsFromCart(items, payTotal)`.

---

## Deduplicación

- `Purchase`, `PedidoCreado`, `ViewContent`: `sessionStorage` + `eventID` en `fbq`
- `InitiateCheckout`: una vez por sesión (`meta_pixel:InitiateCheckout`)

---

## Validación

1. Extensión **Meta Pixel Helper** (Chrome)
2. **Meta Events Manager → Test Events**
3. Flujos sugeridos:
   - Producto → `ViewContent`
   - Agregar al carrito → `AddToCart`
   - Checkout → `InitiateCheckout` + `AddPaymentInfo`
   - MP test aprobado → `Purchase`
   - Transferencia → `PedidoCreado` (no `Purchase`)

Coordinar con marketing: verificar dominio en Business Manager y evitar pixel duplicado en GTM.

---

## Microdatos de catálogo (fichas)

En `producto/[slug]` se emite JSON-LD `Product` + `Offer` y tags Open Graph `product:*` (`product:retailer_item_id`, precio, availability). El **id** es el mismo `codigo` de variante que usa el Pixel (`content_ids`). Builder: `client/src/app/utils/productMicrodata.ts`.

Validar con [Microdata Debug](https://business.facebook.com/ads/microdata/debug) tras deploy.

## Fuera de alcance (por ahora)

- Conversions API (CAPI) al confirmar pedido en admin
- `Purchase` para transferencia/efectivo cuando admin verifica el pago
- Verificación de dominio / carga CSV del catálogo (configuración en Meta Business)

---

## Mantenimiento

- Cambiar pixel: `NEXT_PUBLIC_META_PIXEL_ID`
- Nuevo evento: función en `metaPixel.client.ts` + llamada en el punto de negocio correspondiente
- Tests: `npm test -- --run src/app/analytics/metaPixel/metaPixel.mappers.test.ts` (desde `client/`)

## Referencias Meta

- [Meta Pixel](https://developers.facebook.com/docs/meta-pixel)
- [Eventos estándar ecommerce](https://developers.facebook.com/docs/meta-pixel/reference#standard-events)
