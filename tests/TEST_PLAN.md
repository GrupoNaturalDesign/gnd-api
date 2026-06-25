# Plan de Testing — GND (API + Client)

## Objetivo

**Tranquilidad operativa:** un desarrollador puede correr tests automatizados y confiar en que:

1. La **API** no rompe contratos críticos (checkout, MP, envíos, cupones, emails).
2. El **Client** no rompe reglas de negocio visibles al usuario (carrito, precios, validaciones, flujo checkout, retorno MP).
3. Lo que se prueba en cada capa está **delimitado** (sin duplicar en vano ni dejar huecos).

> “Tranquilidad absoluta” = pirámide completa (unit → integración ligera → E2E crítico).  
> No es solo `npm run test:run` en client con 5 tests.

---

## Estado actual

### API ✅

| Métrica | Valor |
|---------|--------|
| Tests unit/shipping/checkout/etc. | **~160+** en `api/tests/` |
| Comando | `cd api && npm run test` (~33s) |
| DB / integración | `npm run test:integration` (requiere MariaDB) |

**Scripts API** (`api/package.json`):

| Script | Descripción |
|--------|-------------|
| `npm run test` | Suite principal (sin DB obligatoria) |
| `npm run test:unit` | Suite unitaria sin integración/sandbox |
| `npm run test:ci` | Suite CI (como test pero para pipeline) |
| `npm run test:shipping` | Solo envíos |
| `npm run test:sandbox` | Andreani/Correo sandbox (manual, credenciales) |
| `npm run test:integration` | Tests con DB real (MariaDB) |

**Organización de tests** (`api/tests/`):

| Directorio | Contenido |
|------------|-----------|
| `cupones/` | Test del motor de cupones (unit + integration) |
| `checkout/` | Checkout MP (unit: funciones puras, validación, webhook) |
| `shipping/` | Envíos (Andreani, Correo Argentino) |
| `sfactory/` | S-Factory: `buildPedidoExternoParams` |
| `lib/` | Utilidades y helpers varios |
| `email/` | Tests de email |
| `helpers/` | Mock utilities (`mock-fetch`, `test-utils`, `shipping-env`) |
| `fixtures/` | Datos de prueba (pendiente) |
| *(raíz)* | Tests sueltos que no requieren subdirectorio (`pedido-sync`, `mp-checkout-webhook`, `maintenance-mode`, etc.) |

**Patrones de mock:**

- **Clases con DI:** `CuponEngineService` usa `this.prisma` (campo privado) + `mockPrisma()` que sobreescribe `instance.prisma` con un objeto mock.
- **Mock factory:** `createMockPrisma()` en `helpers/test-utils.ts` devuelve un cliente Prisma mock completo con `mock.fn()`.
- **Express helpers:** `mockExpressReq()` y `mockExpressRes()` en `helpers/test-utils.ts`.
- **Fetch mock:** `MockFetch` class en `helpers/mock-fetch.ts` para mockear `globalThis.fetch`.
- **Env helpers:** `withEnv()` / `withShippingEnv()` en `helpers/shipping-env.ts`.
- **Funciones puras exportadas:** Se exportan desde el service para testeo directo (`extractMercadoPagoPaymentId`, `buildWebhookDedupeKey`, `splitNombreApellido`, `extractPedidoIdFromExternalReference`, `buildPedidoExternoParams`).

### Client — en progreso (Sprint 1 iniciado)

| Métrica | Valor |
|---------|--------|
| Infra | Vitest + jsdom + `@vitejs/plugin-react` |
| Comando | `cd client && pnpm run test:run` |
| PostCSS | Formato objeto en `postcss.config.mjs` (Next + Vitest) |

**Sprint 1 (26 tests, 6 archivos):** carrito, MP return, precios, checkout validation/rutas, email-domain.

**Sprint 2 (55 tests, 13 archivos):** + displays perfil/admin, shipping quotes, schemas auth/contact, `formatPrice`, `email-validation`.

**Sprint 3 (70 tests, 17 archivos):** hooks checkout — `useCheckoutMpPayment`, `useCheckoutSessionLifecycle`, `useClearCheckoutOnAuthChange`, `useCheckoutStep3Shipping` + `vitest.setup.ts`.

**Sprint 4 (85 tests, 22 archivos):** RTL — `MpResultStatusBlock`, `OrderStatusBadge`, `CheckoutShippingQuoteOptionCard`, `OrderSummarySection`, `CheckoutStep2PersonalSection`.

**Sprint 5 (E2E + CI):** Playwright `client/e2e/` (**10** E2E), `playwright.config.ts`, `.github/workflows/client-tests.yml`. Unit: **100** tests Vitest.

**Sprint checkout tienda (factura, config, 48h):** API — `empresa-tienda-config.service.test.ts`, `checkout/checkout-manual-expires.test.ts`, `checkout/checkout-address.util.test.ts`; actualizados `pedido-email-notification`, `pedido-entrega.util`. Client — `shippingAddress.test.ts`, `checkoutPaymentCopy.test.ts`, `checkoutMp.buildEnvio.test.ts`; actualizados `checkoutStep2.validation`, `OrderSummarySection`. QA manual: [`docs/checkout-tienda-factura-qa.md`](../../docs/checkout-tienda-factura-qa.md).

### Fuera del pipeline automático

| Artefacto | Ubicación | Uso |
|-----------|-----------|-----|
| `test-mp.ts` | `api/src/services/mercadopago/` | Script **manual** contra MP sandbox (crear preferencia). No es `*.test.ts`. |
| Tests sandbox shipping | `api/tests/shipping/sandbox/` | Credenciales reales Andreani/Correo |
| Tests con DB | `cupon-engine.integration`, `admin-notification.integration`, etc. | `npm run test:integration` cuando hay DB |

---

## Principios de reparto API ↔ Client

| Responsabilidad | API | Client |
|-----------------|-----|--------|
| Firma webhook MP, persistencia pedido | ✅ | ❌ |
| Parseo query string retorno MP | ❌ | ✅ `mpResultQuery.ts` |
| Cotización Andreani/Correo, providers | ✅ | Mock en hooks; unit de mapeo UI |
| Motor de cupones, S-Factory payload | ✅ | UX (código aplicado, mensajes) |
| `email-domain.core` | ✅ `api/src/utils/` | ✅ `client/src/lib/` — **mantener sync** |
| JWT cookie, roles admin | API verifica token | Middleware + redirects (funciones puras testeables) |
| Cálculo IVA / totales carrito | API al confirmar | `cartTotals` / `cartStore` |

**Regla:** no re-testear en el front lo que ya cubre la API con mocks HTTP; testear **lógica que vive solo en el browser** o **contrato de presentación**.

---

## Pirámide Client (objetivo final)

```
                    ┌─────────────┐
                    │  E2E (5–8)  │  Playwright — funnel crítico
                    └──────┬──────┘
               ┌────────────┴────────────┐
               │  Componentes (15–25)   │  RTL — checkout, MP result, profile
               └────────────┬───────────┘
          ┌──────────────────┴──────────────────┐
          │  Hooks / stores (10–15)              │
          └──────────────────┬──────────────────┘
     ┌───────────────────────┴───────────────────────┐
     │  Unit puras (40–60)                         │
     └─────────────────────────────────────────────┘
```

**Meta:** ~80–120 tests client en CI &lt; 2 min; E2E aparte &lt; 10 min.

---

## Fase 0 — Infraestructura Client (P0)

- [x] Vitest + `vitest.config.ts`
- [x] `@vitejs/plugin-react`, PostCSS compatible
- [x] Exportar `calculateTotals` → `cartTotals.ts`
- [x] `cartStore.test.ts` importa código real
- [x] `vitest.setup.ts` (React act env)
- [ ] `test:coverage` en `package.json`
- [ ] README client: correr tests antes de PR

---

## Fase 1 — Unit puras (P0)

### 1.1 Carrito y precios

| Archivo | Estado |
|---------|--------|
| `cartTotals.ts` / `cartStore.test.ts` | ✅ |
| `useEmpresaPrecioConfig.ts` → `calcularPreciosDerivados` | ✅ |
| `precio.ts` (`formatPrice`) | ✅ |

### 1.2 Checkout

| Archivo | Estado |
|---------|--------|
| `checkoutStep2.validation.ts` | ✅ parcial |
| `checkoutRoutes.ts` | ✅ |
| `shipping/shippingQuote.utils.ts` | ✅ |
| `services/mpResultQuery.ts` | ✅ |

### 1.3 Email (paridad API)

| Archivo | Estado |
|---------|--------|
| `lib/email-domain.core.ts` | ✅ |
| `lib/email-validation.ts` | ✅ |

### 1.4 Perfil / admin display

| Archivo | Estado |
|---------|--------|
| `cuentaPedidosDisplay.ts` | ✅ |
| `pedidoEntregaDisplay.ts` | ✅ |
| `adminPedidos.utils.ts` | ✅ |

### 1.5 Schemas Zod

| Archivo | Estado |
|---------|--------|
| `login.schema.ts`, `register.schema.ts`, `contactSchema.ts` | ✅ (`authSchemas.test.ts`) |

---

## Fase 2 — Hooks y stores con RTL (P1)

| Hook | Estado |
|------|--------|
| `useCheckoutMpPayment.ts` | ✅ |
| `useCheckoutStep3Shipping.ts` | ✅ |
| `useCheckoutSessionLifecycle.ts` | ✅ |
| `useClearCheckoutOnAuthChange.ts` | ✅ |
| `useSyncAuthToCart.ts` | Pendiente |
| `useMisPedidosList.ts` | Pendiente |

---

## Fase 3 — Componentes críticos (P1–P2)

| Componente | Estado |
|------------|--------|
| `MpResultStatusBlock.tsx` | ✅ |
| `CheckoutStep2PersonalSection.tsx` | ✅ |
| `CheckoutShippingQuoteOptionCard.tsx` | ✅ |
| `OrderSummarySection.tsx` | ✅ |
| `OrderStatusBadge.tsx` | ✅ |
| `NewsletterPopup.tsx` | Pendiente |

---

## Fase 4 — Rutas API Next (P2)

- `app/api/auth/session/route.ts`
- `app/api/contact/route.ts`
- `app/api/user/roles/route.ts`

---

## Fase 5 — E2E Playwright (P2–P3)

| Spec | Escenarios |
|------|------------|
| `e2e/smoke.spec.ts` | home, login, shoponline |
| `e2e/auth-guard.spec.ts` | checkout/admin sin sesión, checkout con cookie |
| `e2e/mp-result.spec.ts` | pago aprobado, pending |
| `e2e/checkout-datos.spec.ts` | formulario datos, validación nombre |

**Helpers:** `e2e/helpers/auth.ts` (JWT e2e), `e2e/helpers/apiMocks.ts`

**Pendiente E2E:** envío cotizado, pago MP completo, perfil pedidos, cupón.

---

## Fase 6 — CI

### API

Workflow: `.github/workflows/api-tests.yml`

- **PR / push (paths: `api/**`):** `pnpm run test:unit` (node --test, obligatorio)
- **Push `main` / `master` / `test`:** además `pnpm run test:integration` con MariaDB service container

### Client

Workflow: `.github/workflows/client-tests.yml`

- **PR / push (paths: `client/**`):** `pnpm run test:run` (Vitest, obligatorio)
- **Push `main` / `master` / `test`:** además `pnpm run test:e2e` (Playwright chromium)

```bash
cd api && npm run test
cd ../client && pnpm run test:run
cd client && pnpm run test:e2e   # requiere dev server / CI
```

---

## Roadmap

| Sprint | Entregable | Tests client (aprox.) |
|--------|------------|------------------------|
| S1 | Fase 0 + 1.1–1.3 core | **26** ✅ |
| S2 | 1.4–1.6 + shipping utils | **55** ✅ |
| S3 | Fase 2 hooks checkout | **70** ✅ |
| S4 | Fase 3 componentes | **85** ✅ |
| S5 | E2E Playwright + CI | ✅ (10 E2E + 100 unit) |
| S4 | Fase 3 componentes | ~70 |
| S5 | Playwright + CI E2E | E2E + unit |

---

## Comandos

| Ámbito | Comando |
|--------|---------|
| API unit | `cd api && npm run test` |
| API sandbox | `npm run test:sandbox` |
| MP manual | `npx ts-node src/services/mercadopago/test-mp.ts` (desde `api/`) |
| Client unit | `cd client && pnpm run test:run` |
| Client watch | `pnpm run test` |
| Client E2E | `cd client && pnpm exec playwright install chromium && pnpm run test:e2e` |
| Client E2E UI | `pnpm run test:e2e:ui` |
| Confianza diaria | `cd api && npm run test && cd ../client && pnpm run test:run` |

---

## Checklist “tranquilidad” Client

- [x] `cartStore` testea `cartTotals` real
- [x] `parseMercadoPagoReturnParams` cubierto
- [x] `calcularPreciosDerivados` cubierto
- [x] `checkoutStep2` validación básica
- [x] `email-domain.core` paridad con API
- [x] `shippingQuote.utils` cubierto
- [x] Schemas login/register/contact
- [x] Hooks checkout críticos (MP, envío, lifecycle, auth)
- [x] RTL checkout crítico (MP result, envío, resumen, datos personales, badge pedido)
- [x] `pnpm run test:run` en CI
- [x] E2E smoke + checkout guard + MP result (mock API)
- [ ] E2E funnel checkout completo (envío + pago)

---

## Deuda / riesgos

1. `email-domain.core` duplicado API/client — considerar `packages/shared` a futuro.
2. Firebase / `jose` en middleware — extraer helpers testeables (`isAdminRole`, rutas públicas).
3. No testear los 600+ archivos TS; priorizar dinero (checkout, carrito, precios, MP UI).
