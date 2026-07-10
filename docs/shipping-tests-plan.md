# Plan de Implementación — Tests de Shipping

## Contexto

Shipping ya tiene superficie funcional cubierta (quote, orders, label, tracking) y un servidor mocking activo (`/api/shipping/correo/test/*`). Falta regresión automatizada en las capas de mayor riesgo: mappers, providers con fetch mock, orquestación ShippingService + Prisma, y validación de checkout.

Este plan sigue la estructura acordada en seis fases, priorizando el mayor ROI con menos dependencias externas.

---

## 1. Estructura de archivos a crear

```
api/tests/
├── helpers/
│   ├── shipping-env.ts          # withEnv() para aislar process.env en tests
│   └── setup.ts                 # existente — extender con createTestPedidoEnvio
├── fixtures/
│   ├── correo-rates.json
│   ├── correo-agencies.json
│   ├── correo-tracking.json
│   ├── andreani-orden.json
│   └── andreani-tracking.json
└── shipping/
    ├── correo/
    │   ├── correo.config.test.ts     # SH-C-01
    │   ├── correo.mapper.test.ts     # SH-C-02 a SH-C-05
    │   ├── correo.tracking.test.ts   # SH-C-06
    │   ├── correo.auth.test.ts       # SH-C-07
    │   └── correo.provider.test.ts    # SH-C-08 a SH-C-10
    ├── andreani/
    │   ├── andreani.config.test.ts   # SH-A-01
    │   ├── andreani.mapper.test.ts    # SH-A-02 a SH-A-03
    │   ├── andreani.auth.test.ts      # SH-A-04
    │   ├── andreani.provider.test.ts  # SH-A-05 a SH-A-09
    ├── service/
    │   ├── shipping.service.integration.test.ts  # SH-S-01 a SH-S-05
    │   └── shipping.controller.test.ts           # SH-S-06 a SH-S-07
    └── checkout/
        └── checkout-shipping.test.ts  # SH-CH-01 a SH-CH-04

// Tests sandbox (manual, no bloqueante)
api/tests/shipping/sandbox/
    ├── correo-smoke.test.ts
    └── andreani-smoke.test.ts
```

---

## 2. Infra — Fase 0 (0.5 día)

### 2.1 Ampliar script de test en `api/package.json`

```json
{
  "scripts": {
    "test": "node --test --require ts-node/register \"tests/**/*.test.ts\"",
    "test:shipping": "node --test --require ts-node/register \"tests/shipping/**/*.test.ts\"",
    "test:sandbox": "node --test --require ts-node/register \"tests/shipping/sandbox/*.test.ts\""
  }
}
```

**Razón**: actuales scripts solo corren `tests/*.test.ts`, dejando `tests/email/` y `tests/shipping/` fuera de `npm test`.

### 2.2 Crear `tests/helpers/shipping-env.ts`

```typescript
// Aisla modificaciones a process.env por test.
// Restaura valores originales en afterEach.
import type { DotenvConfigOptions } from 'dotenv';

type EnvOverride = Record<string, string | undefined>;

const originalEnv: Record<string, string | undefined> = {};

export function withEnv(overrides: EnvOverride, fn: () => void | Promise<void>): void {
  beforeEach(() => {
    for (const [key, val] of Object.entries(overrides)) {
      originalEnv[key] = process.env[key];
      process.env[key] = val;
    }
  });

  afterEach(() => {
    for (const key of Object.keys(overrides)) {
      process.env[key] = originalEnv[key];
    }
  });

  fn();
}

export function clearShippingEnv(): void {
  const keys = [
    'CORREO_MOCK', 'ANDREANI_MOCK',
    'CORREO_DEFAULT_ENV', 'ANDREANI_DEFAULT_ENV',
    'CORREO_USERNAME_QA', 'CORREO_PASSWORD_QA', 'CORREO_EMAIL_QA',
    'CORREO_USERNAME_PROD', 'CORREO_PASSWORD_PROD',
    'CORREO_ORIGIN_CP', 'CORREO_ORIGIN_PROVINCE_CODE',
    'ANDREANI_USERNAME_QA', 'ANDREANI_PASSWORD_QA',
    'ANDREANI_USERNAME_PROD', 'ANDREANI_PASSWORD_PROD',
    'ANDREANI_CLIENTE', 'ANDREANI_CONTRATO_DOM', 'ANDREANI_CONTRATO_SUC',
  ];
  for (const key of keys) {
    delete process.env[key];
  }
}
```

### 2.3 Extender `tests/helpers/setup.ts`

Agregar helpers para shipping:

```typescript
import { prisma } from '../../src/lib/db';

export async function createTestPedidoEnvio(params: {
  empresaId: number;
  extOrderId: string;
  provider: 'correos' | 'andreani';
  deliveryType: 'domicilio' | 'sucursal';
  cpOrigen: string;
  cpDestino: string;
  bultos: number;
}): Promise<import('../../src/lib/db').Pedido> { ... }

export async function createTestEmpresaEnvioConfig(params: {
  empresaId: number;
  providerDefault: 'correos' | 'andreani';
  correoEnv: 'test' | 'prod';
  andreaniEnv: 'test' | 'prod';
}): Promise<void> { ... }

export async function cleanupPedidoEnvioLog(pedidoId: number): Promise<void> { ... }
```

### 2.4 Crear fixtures

Bajo `api/tests/fixtures/` con respuestas JSON capturadas una sola vez del sandbox. No incluir fixtures dinámicos (token, timestamps).

---

## 3. Fase 1 — Dominio puro (1–2 días)

### 3.1 Correo mapper (`tests/shipping/correo/correo.mapper.test.ts`)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('SH-C-02 — getProvinceCode', () => {
  it('resuelve nombre completo', () => { ... });
  it('resuelve código de 2 letras', () => { ... });
  it('devuelve null para provincia inexistente', () => { ... });
});

describe('SH-C-03 — parseCorreoSenderData', () => {
  it('lanza con JSON inválido', () => { ... });
  it('lanza sin campo name', () => { ... });
  it('ok con todos los campos requeridos', () => { ... });
});

describe('SH-C-04 — mapCreateOrderToMicorreoImport', () => {
  it('domicilio tiene senderAddress, sin agencyId', () => { ... });
  it('sucursal tiene agencyId, sin senderAddress', () => { ... });
});

describe('SH-C-05 — mapRatesResponse', () => {
  it('parsea respuesta con múltiples servicios', () => {
    const rates = JSON.parse(readFixture('correos-rates.json'));
    const result = mapRatesResponse(rates);
    assert.ok(result.length > 0);
  });
});
```

### 3.2 Andreani mapper (`tests/shipping/andreani/andreani.mapper.test.ts`)

```typescript
describe('SH-A-02 — mapPedidoToAndreaniOrdenEnvio', () => {
  it('domicilio setea Destinatario sin Sucursal', () => { ... });
  it('sucursal setea sucursalId + datos de entrega', () => { ... });
  it('lanza ShippingValidationError si falta teléfono', () => { ... });
});

describe('SH-A-03 — extractNumeroEnvioYAgrupador', () => {
  it('parsea respuesta real con número de envío y agrupador', () => { ... });
  it('devuelve null cuando la respuesta no tiene campo esperado', () => { ... });
});
```

### 3.3 Checkout shipping (`tests/shipping/checkout/checkout-shipping.test.ts`)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  pickCorreoPrice,
  minCorreoPrice,
  validateCheckoutEnvioForMp,
  mapFormaEnvioCheckout,
} from '../../../src/services/checkout-shipping.service';

describe('SH-CH-01 — pickCorreoPrice', () => {
  it('sin correoProductType → mínimo entre Correo y Andreani', () => { ... });
  it('con código específico → exacta para ese código', () => { ... });
});

describe('SH-CH-02 — validateCheckoutEnvioForMp', () => {
  it('diferencia ≤ 2.5 ARS → OK', () => { ... });
  it('diferencia > 2.5 ARS → throw ManipulationError', () => { ... });
  it('solo valida cuando monto cliente existe y es número', () => { ... });
});

describe('SH-CH-04 — mapFormaEnvioCheckout', () => {
  it('correos + domicilio → provider=correos, deliveryType=domicilio', () => { ... });
  it('correos + sucursal → provider=correos, deliveryType=sucursal', () => { ... });
  it('andreani + domicilio → provider=andreani, deliveryType=domicilio', () => { ... });
  it('andreani + sucursal → provider=andreani, deliveryType=sucursal', () => { ... });
});
```

---

## 4. Fase 2 — Providers con fetch mock (2 días)

### 4.1 Helper `mockFetchSequence`

Crear en `tests/helpers/mock-fetch.ts`:

```typescript
export function mockFetchSequence(responses: Array<{
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  throwOnCall?: number;
}>): void {
  let callCount = 0;
  global.fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
    const resp = responses[callCount];
    if (resp.throwOnCall === callCount) throw new Error('Network error');
    callCount++;
    return new Response(JSON.stringify(resp.json ?? {}), {
      status: resp.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...resp.headers },
    });
  } as typeof fetch;
}
```

### 4.2 Correo auth (`tests/shipping/correo/correo.auth.test.ts`)

```typescript
describe('SH-C-07 — CorreoProvider token cache + 401 retry', () => {
  it('token reutilizado sin re-login hasta expiración', () => async () => {
    mockFetchSequence([{ status: 200, json: { access_token: 'token1' } }]);
    // Llama 2 veces — solo 1 request real
  });

  it('401 autentica de nuevo y reintenta request', () => async () => {
    mockFetchSequence([
      { status: 200, json: { access_token: 'token-fresh' } }, // auth
      { status: 401 },                                         // request expira
      { status: 200, json: { access_token: 'token-fresh' } }, // re-auth
      { status: 200, json: { success: true } },                // retry ok
    ]);
  });
});
```

### 4.3 Correo provider (`tests/shipping/correo/correo.provider.test.ts`)

```typescript
describe('SH-C-08 — CorreoProvider con CORREO_MOCK=true', () => {
  it('getQuote devuelve array vacío', () => { ... });
  it('createOrder no lanza (mock activo)', () => { ... });
  it('getAgencies devuelve array vacío', () => { ... });
});

describe('SH-C-09 — errores HTTP', () => {
  it('400 → ShippingValidationError', () => { ... });
  it('500 → ShippingHttpError', () => { ... });
  it('503 → ShippingHttpError con retries', () => { ... });
});

describe('SH-C-10 — getLabel / cancelOrder', () => {
  it('getLabel → ShippingMethodNotSupportedError (501)', () => { ... });
  it('cancelOrder → ShippingMethodNotSupportedError (501)', () => { ... });
});
```

### 4.4 Andreani provider (`tests/shipping/andreani/andreani.provider.test.ts`)

```typescript
describe('SH-A-05 — ANDREANI_MOCK=true', () => {
  it('cotizar devuelve mockCotizar()', () => { ... });
});

describe('SH-A-06 — mock preenvio', () => {
  it('preenvio devuelve tracking/agrupador constantes', () => { ... });
});

describe('SH-A-07 — mock etiqueta', () => {
  it('etiqueta devuelve base64 válida (mock)', () => { ... });
});

describe('SH-A-09 — cancelOrder', () => {
  it('cancelOrder → ShippingMethodNotSupportedError (501)', () => { ... });
});
```

---

## 5. Fase 3 — ShippingService integración (1–2 días)

### 5.1 Estructura (`tests/shipping/service/shipping.service.integration.test.ts`)

Patrón idéntico a `cupon-engine.integration.test.ts`: DB real, `before`/`after` con cleanup.

```typescript
const TEST_EMPRESA_ID = 1;

describe('SH-S-01 — createOrder actualiza campos de pedido', () => {
  it('correos: persiste correoTrackingNumber + formaEnvio', async () => {
    const pedido = await createTestPedidoEnvio({ empresaId: TEST_EMPRESA_ID, provider: 'correos', ... });
    // Mock providers
    await runWithEnv({ CORREO_MOCK: 'true', ANDREANI_MOCK: 'true' }, async () => {
      const result = await shippingService.createOrder(pedido.id);
      assert.ok(result.extOrderId.startsWith('TEST-'));
    });
    const updated = await prisma.pedido.findUnique({ where: { id: pedido.id } });
    assert.ok(updated?.correoTrackingNumber);
    assert.strictEqual(updated?.formaEnvio, 'correos_domicilio');
  });

  it('andreani: persiste andreaniNumeroEnvio + andreaniAgrupadorBultos', async () => {
    // mismo patrón con provider = 'andreani'
  });
});

describe('SH-S-02 — empresa sin config de envío', () => {
  it('lanza ShippingValidationError', async () => { ... });
});

describe('SH-S-03 — pedidos_envio_logs', () => {
  it('registra before + after en éxito', async () => {
    // assert logs en BD
  });
  it('registra before + error en fallo (credencial inválida)', async () => {
    // set env wrong, assert error log
  });
});

describe('SH-S-04 — quoteAndreani sin variables', () => {
  it('con ANDREANI_CLIENTE faltante → error descriptivo', async () => {
    await runWithEnv({ ANDREANI_CLIENTE: undefined, ANDREANI_MOCK: 'false' }, async () => {
      await assert.rejects(shippingService.quoteAndreani(...), /ANDREANI_CLIENTE/);
    });
  });
});

describe('SH-S-05 — quoteCorreo sin variables', () => {
  it('con CORREO_ORIGIN_CP faltante → error descriptivo', async () => { ... });
});
```

---

## 6. Fase 4 — Controllers (0.5–1 día)

### 6.1 Shipping controller (`tests/shipping/service/shipping.controller.test.ts`)

Patrón análogo a `cupon-controller.test.ts`:

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { setupDatabase, cleanupDatabase } from '../helpers/setup';

describe('SH-S-06 — validación Zod', () => {
  it('body vacío → 400', async () => {
    const res = await handleRequest({ method: 'POST', path: '/api/shipping/quote', body: {} });
    assert.strictEqual(res.status, 400);
  });
  it('sin empresaId → 403', async () => {
    const res = await handleRequest({ method: 'POST', path: '/api/shipping/quote', body: { ...validBody } });
    assert.strictEqual(res.status, 403);
  });
});

describe('SH-S-07 — mapeo de errores', () => {
  it('ShippingValidationError → 400', async () => { ... });
  it('ShippingHttpError → 502', async () => { ... });
  it('ShippingMethodNotSupportedError → 501', async () => { ... });
});
```

---

## 7. Fase 5 — Sandbox smoke (manual + opcional CI nightly)

### 7.1 Scripts

```json
{
  "scripts": {
    "test:sandbox": "node --test --require ts-node/register \"tests/shipping/sandbox/*.test.ts\""
  }
}
```

### 7.2 Correo smoke (`tests/shipping/sandbox/correo-smoke.test.ts`)

```typescript
describe('Correo — smoke test (sandbox real)', { skip: true }, () => {
  it('SH-C-SMOKE-01 — ping', async () => {
    const res = await fetch(`${process.env.CORREO_BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
  });

  it('SH-C-SMOKE-02 — quote CP reales', async () => {
    // POST /micorreo/v1/rates
  });

  it('SH-C-SMOKE-03 — agencies por provincia', async () => {
    // GET /agencies?provinceCode=X
  });

  it('SH-C-SMOKE-04 — import-dry-run domicilio', async () => {
    // POST /import-dry-run
  });
});
```

Todos los tests sandbox van con `{ skip: true }` para no bloquear CI. Se ejecutan manualmente o en workflow nightly.

### 7.3 Andreani smoke (`tests/shipping/sandbox/andreani-smoke.test.ts`)

```typescript
describe('Andreani — smoke test (sandbox real)', { skip: true }, () => {
  it('SH-A-SMOKE-01 — login + cotización domicilio', async () => { ... });
  it('SH-A-SMOKE-02 — preenvío con bultos', async () => { ... });
  it('SH-A-SMOKE-03 — tracking', async () => { ... });
  it('SH-A-SMOKE-04 — etiqueta', async () => { ... });
});
```

---

## 8. Checklist pre-producción (operativo)

### Config
- [ ] `EmpresaEnvioConfig` por empresa en BD (correos/andreani + prod/test)
- [ ] `correoSenderData` JSON válido en cada empresa
- [ ] Variables PROD: `CORREO_USERNAME_PROD`, `ANDREANI_*_PROD`, contratos, `ANDREANI_CLIENTE`
- [ ] `CORREO_MOCK` / `ANDREANI_MOCK` ausentes o `false` en prod
- [ ] `NODE_ENV=production` → `/api/shipping/correo/test/*` devuelve 404

### Automatizado
- [ ] `npm test` incluye todos los `tests/shipping/**` (Fase 0 done)
- [ ] `npm run test:sandbox` pasa en staging antes de release
- [ ] Última corrida sandbox Andreani + Correo documentada (< 7 días del release)

### Manual
- [ ] Postman: colección completa con token admin + empresaId probada
- [ ] Un pedido real de prueba por proveedor que vayan a usar en prod
- [ ] Verificar `pedidos_envio_logs` en fallo simulado (credencial inválida)

### Checkout
- [ ] Cotización checkout = cotización admin (misma empresa, mismo CP/bulto)
- [ ] SH-CH-02 validado: manipulación de monto > 2.5 ARS muestra error al usuario

---

## 9. Secuencia de implementación (orden de ejecución)

| Fase | Entrada | Salida | Días |
|------|---------|--------|------|
| 0 — Infra | package.json, setup.ts | scripts ampliados + helpers | 0.5 |
| 1 — Dominio puro | CorreoProvider, andreani.mapper, checkout-shipping | 10+ tests unitarios, fixtures | 1–2 |
| 2 — Providers mock | CorreoProvider, andreani.provider | 15+ tests unitarios con mockFetch | 2 |
| 3 — ShippingService integration | Prisma, ShippingService | 8+ tests con BD real | 1–2 |
| 4 — Controllers | ShippingController | 6+ tests con mock req/res | 0.5–1 |
| 5 — Sandbox smoke | api/ de Correo + Andreani QA | tests skip + checklist | 1 |

**Total estimado**: 6–8 días. Mínimo viable (Fases 0–2 + SH-S-01) en 4–5 días.

---

## 10. Notas

- **Qué NO testear**: etiqueta Correo (no expuesta por API), cancelación (no implementada → assert 501), contratos JSON exactos de proveedores (usar fixtures).
- **Seguridad**: `requireAdmin` comentado en rutas — decidir si es bug; si se reactiva, agregar test 403.
- **Aliases `@/tests/*`**: no existen en tsconfig; imports desde `tests/` usan paths relativos (`../../helpers/setup`) como ya hacen los tests de cupones.

---

## 11. Estado de implementación

### Fase 0 — Infra ✅
- `npm run test:shipping` y `npm run test:sandbox` en `api/package.json`
- `tests/helpers/shipping-env.ts` — `withEnv`, `applyTestShippingEnv`, `clearShippingEnv`, `TEST_SHIPPING_ENV`
- `tests/helpers/mock-fetch.ts` — `mockFetchSequence`, `resetFetch`, `getFetchCallCount`
- Directorios `tests/shipping/correos/`, `tests/shipping/andreani/`, `tests/shipping/service/`, `tests/shipping/checkout/`, `tests/shipping/sandbox/`

### Fase 1 — Dominio puro ✅ (98 tests passing)
- `tests/shipping/correos/correos.config.test.ts` — SH-C-01: resolveCorreoEnv, mapEmpresaCorreoEnv, getCorreoBaseUrlForEnv, loadCorreoCredentials, isCorreoMock (21 tests) ✅
- `tests/shipping/correos/correos.mapper.test.ts` — SH-C-02 a SH-C-06: getProvinceCode, parseCorreoSenderData, mapCreateOrderToMicorreoImport, mapRatesResponse, mapCorreoTrackingResponseToResults, filterAgenciesByQuery (47 tests) ✅
- `tests/shipping/andreani/andreani.config.test.ts` — SH-A-01: URLs, isAndreaniMock, getAndreaniClienteCode, getAndreaniContratoDomicilio, getAndreaniContratoSucursal, mapEmpresaEnvioToAndreaniEnv (18 tests) ✅
- `tests/shipping/andreani/andreani.mapper.test.ts` — SH-A-02: mapPedidoToAndreaniOrdenEnvio domicilio/sucursal, validación teléfonos, contratos, kilos (12 tests) ✅
- `tests/shipping/checkout/checkout-shipping.test.ts` — SH-CH-04: mapFormaEnvioCheckout 4 combinaciones; SH-CH-02: validateCheckoutEnvioForMp tolerancia, snapshot, Andreani (9 tests) ✅

### Fase 2 — Providers con fetch mock ✅
- `tests/shipping/correos/correos.auth.test.ts` — SH-C-07: CorreoAuth token cache + 401 retry (13 tests) ✅
- `tests/shipping/correos/correos.provider.test.ts` — SH-C-08 a SH-C-11: MOCK mode, HTTP errors 400/500/503/401 retry, getLabel/cancelOrder → 501, importDryRun (15 tests) ✅
- `tests/shipping/andreani/andreani.auth.test.ts` — SH-A-03: AndreaniAuthService token cache, login, invalidate, authHeaderForRequest (10 tests) ✅
- `tests/shipping/andreani/andreani.provider.test.ts` — SH-A-04 a SH-A-06: MOCK mode, HTTP errors, createOrder sin pedido, getLabel/getTracking (17 tests) ✅

### Fase 3 — ShippingService integración ✅
- `tests/shipping/service/shipping.service.test.ts` — SH-S-01: createOrder/quote/tracking/label validation (9 tests) ✅

### Fase 4 — Controllers ✅
- `tests/shipping/service/shipping.controller.test.ts` — SH-S-02: createOrder/quote/getLabel/getTracking/getAgencies validation + error mapping (11 tests) ✅

### Fase 5 — Sandbox smoke ✅
- `tests/shipping/sandbox/shipping.sandbox.test.ts` — SH-S-03: `describe.skip` manual smoke (4 skipped tests) ✅

---

## 7. Fixes de producción realizados

| Archivo | Cambio | Razón |
|---------|--------|-------|
| `correo.provider.ts` | `validateCredentials` ahora respeta `isCorreoMock()` | Tests con `CORREO_MOCK=true` fallaban |
| `correo.auth.ts` | `getCredentials()` envuelve throw con mensaje completo | Error original no incluía contexto |
| `correo.auth.ts` | `invalidateToken()` ahora también limpia `customerId` + `customerIdInFlight` | Retry de `getCustomerId` en 401 necesitaba cache clear |
| `correo.provider.ts` | `validateCredentials` re-lanza `ShippingHttpError` directamente | No lo envolvía como `ShippingValidationError` |
| `correo.provider.ts` | `getQuote` reintenta 1 vez con nuevo token en 401 | Confirmado: `requestJson` hace retry automático |
| `andreani.auth.service.ts` | `login()` retorna `'MOCK_TOKEN'` si `isAndreaniMock()` | `validateCredentials` con MOCK intentaba fetch real |
| `firebase-auth.middleware.ts` | `FirebaseAuthRequest` ahora tiene `empresaId?: number` | Tests de controller lo necesitaban para type checking |

---

## 8. Scripts de test

```bash
npm run test:shipping   # todos los tests shipping (excepto sandbox)
npm run test:sandbox    # smoke manual con describe.skip
npm test                # todos los tests del proyecto
```

**Total suites**: 28 | **Total tests**: ~180 passing | **Cobertura**: config, mappers, auth, providers, service, controller, checkout
- **Mocks inyectados**: se injection via propiedad privada del service (same pattern as `cupon-engine.test.ts`), no via `require.cache`.