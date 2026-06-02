# Arquitectura de Tests — API GND

## Stack

- **Runner:** `node --test` (built-in, Node.js 22+, no Jest/Vitest)
- **Assert:** `node:assert` (strict mode via `node:assert/strict`)
- **Mocks:** `mock.fn()` from `node:test` (modern mock API)
- **Coverage:** `c8` (via `node --experimental-coverage` o prefijo `c8`)
- **Compilación:** `ts-node` con `--require ts-node/register`
- **CI:** GitHub Actions, `ubuntu-latest`, MariaDB service container para integración

## Estructura de directorios

```
api/tests/
├── ARCHITECTURE.md         # Este archivo
├── TEST_PLAN.md            # Plan estratégico de testing
├── checkout/               # Tests de checkout MP
│   ├── checkout-unit.test.ts        # Funciones puras (extractMercadoPagoPaymentId, etc.)
│   └── checkout-integration.test.ts # Tests con parseo real de checkoutEnvio
│   ├── mp-checkout-core.test.ts     # Validación input crearPedidoMp / crearPedidoManual
│   └── procesar-webhook.test.ts     # Early returns de procesarWebhookMercadoPago
├── cupones/                # Tests del motor de cupones
│   ├── cupon-engine.test.ts              # 23 casos (TC-01 a TC-23), mock.fn()
│   ├── cupon-engine.integration.test.ts  # Tests con DB real (IT-01 a IT-05)
│   ├── cupon-controller.test.ts          # Controlador HTTP de cupones
│   └── cupon-sfactory-payload.test.ts    # Payload S-Factory desde cupón
├── sfactory/               # Tests de integración S-Factory
│   └── sfactory-pedido-externo.test.ts   # buildPedidoExternoParams
├── shipping/               # Tests de envíos (Andreani, Correo Argentino)
│   └── checkout/                        # Parseo de checkoutEnvio
├── helpers/                # Utilidades compartidas
│   ├── mock-fetch.ts       # MockFetch class + global fetch helpers
│   ├── test-utils.ts       # createMockPrisma, mockExpressReq/Res, injectMockPrisma
│   ├── shipping-env.ts     # withEnv/withShippingEnv + TEST_SHIPPING_ENV
│   └── setup.ts            # getTestPrisma, createTestCupon, createTestPedido (integración)
├── lib/                    # Tests de utilidades varias
├── email/                  # Tests de email
├── fixtures/               # Datos de prueba (pendiente)
├── mp-checkout-webhook.test.ts          # Tests de webhook MP (existente)
├── pedido-sync.test.ts                  # Sincronización de pedidos
├── maintenance-mode.test.ts             # Modo mantenimiento
├── maintenance.middleware.test.ts       # Middleware de mantenimiento
├── ... (otros tests sueltos)
```

## Patrones de test

### 1. Mock de Prisma (inyección en clases)

Usado en `CuponEngineService`. La clase declara `private prisma = prismaDefault` (campo privado). En test:

```ts
import { mock } from 'node:test';

function mockPrisma(mockData: { ... }) {
  engine = new CuponEngineService();
  const mockPrismaClient = {
    cupon: { findFirst: mock.fn(() => Promise.resolve(null)) },
    cuponUso: {
      count: mock.fn(() => Promise.resolve(0)),
      create: mock.fn((d) => Promise.resolve({ id: 1, ...d })),
    },
  };
  // TypeScript private es compile-time; en runtime es una property normal
  (engine as unknown as { prisma: unknown }).prisma = mockPrismaClient;
}
```

### 2. Mock factory (helpers/test-utils.ts)

```ts
import { createMockPrisma, injectMockPrisma, mockExpressReq, mockExpressRes } from '../helpers/test-utils';

const mockClient = createMockPrisma({
  cupon: { findFirst: mock.fn(() => Promise.resolve({ id: 1, ... })) },
  cuponUso: { count: mock.fn(() => Promise.resolve(5)) },
});
injectMockPrisma(engineInstance, mockClient);
```

### 3. Mock de funciones puras exportadas

Funciones sin efectos secundarios se exportan desde el service y se importan directamente:

```ts
import { extractMercadoPagoPaymentId, buildWebhookDedupeKey } from '../../src/services/mp-checkout.service';
```

### 4. Mock de fetch global

```ts
import { MockFetch, setGlobalMockFetch, resetGlobalFetch } from '../helpers/mock-fetch';

const mockFetch = new MockFetch([{ json: { ... } }]);
setGlobalMockFetch(mockFetch);
// ... test ...
resetGlobalFetch();
```

### 5. Tests de integración (con DB real)

Requieren MariaDB corriendo y usan `getTestPrisma()` de `helpers/setup.ts`.  
Se ejecutan con `npm run test:integration`.

## Convenciones

- Archivos `.test.ts` para tests unitarios (sin DB)
- Archivos `.integration.test.ts` para tests que requieren DB real
- Un `describe` por funcionalidad; nombres de test en español descriptivo
- Usar `mock.fn()` en lugar de object literals para mocks (moderno)
- No usar Jest/Vitest en API (respetar stack node:test)
- Funciones puras sin side effects deben exportarse para testeo directo

## Comandos

```bash
# Suite completa (sin DB)
npm run test

# Solo unitarios (excluye integration/sandbox)
npm run test:unit

# Un archivo específico
node --test --require ts-node/register "tests/cupones/cupon-engine.test.ts"

# Tests de integración (requiere MariaDB)
npm run test:integration

# Con cobertura
npx c8 npm run test
```
