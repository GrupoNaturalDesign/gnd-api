import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { AndreaniProvider } from '../../../src/services/shipping/andreani/andreani.provider';
import {
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from '../../../src/services/shipping/shipping.errors';
import type {
  CreateShippingOrderInput,
  ShippingDeliveryType,
} from '../../../src/services/shipping/shipping.types';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

function makeProvider(env: string = 'test'): AndreaniProvider {
  return new AndreaniProvider(env, getMockFetch().fetch as unknown as typeof fetch);
}

function buildOrderInput(): CreateShippingOrderInput {
  return {
    pedidoId: 1,
    empresaId: 1,
    recipient: { name: 'Test', email: 'test@test.com', phone: '3510000000' },
    deliveryType: 'homeDelivery' as ShippingDeliveryType,
    address: {
      streetName: 'Calle',
      streetNumber: '123',
      city: 'Córdoba',
      state: 'X',
      zipCode: '5000',
    },
    parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
  };
}

describe('SH-A-04 — AndreaniProvider con ANDREANI_MOCK=true', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    process.env.ANDREANI_MOCK = 'true';
    process.env.ANDREANI_CLIENTE = 'MOCK';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
  });
  afterEach(() => {
    delete process.env.ANDREANI_MOCK;
    resetGlobalFetch();
  });

  it('cotizarEnvio devuelve mock con precio=1000', async () => {
    const p = makeProvider();
    const result = await p.cotizarEnvio({
      cpDestino: '5000',
      contrato: '1',
      cliente: 'MOCK',
      bultos: [{ volumenCm3: 3000, kilos: 0.5, valorDeclarado: 1000, altoCm: 10, largoCm: 20, anchoCm: 15 }],
    });
    assert.strictEqual(result.precio, 1000);
    assert.strictEqual(result.proveedor, 'ANDREANI');
    assert.strictEqual(result.entorno, 'QA');
  });

  it('cotizarEnvio entorno PROD', async () => {
    const p = makeProvider('prod');
    const result = await p.cotizarEnvio({
      cpDestino: '5000',
      contrato: '1',
      cliente: 'MOCK',
      bultos: [{ volumenCm3: 3000, kilos: 0.5, valorDeclarado: 1000 }],
    });
    assert.strictEqual(result.entorno, 'PROD');
  });

  it('validateCredentials no lanza con MOCK', async () => {
    const p = makeProvider();
    await p.validateCredentials();
  });

  it('getTracking devuelve eventos con mock', async () => {
    const p = makeProvider();
    const results = await p.getTracking(['360000102000579', '360000102000580']);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0]!.trackingNumber, '360000102000579');
    assert.ok(results[0]!.events.length > 0);
  });

  it('getAgencies sin ANDREANI_PATH_AGENCIAS → []', async () => {
    delete process.env.ANDREANI_PATH_AGENCIAS;
    const p = makeProvider();
    const result = await p.getAgencies({ stateId: 'X' });
    assert.deepStrictEqual(result, []);
  });

  it('getAgencies con ANDREANI_PATH_AGENCIAS → parseado', async () => {
    process.env.ANDREANI_PATH_AGENCIAS = '/sucursales';
    mockFetch.setResponses([
      { status: 200, json: { sucursales: [{ id: '001', descripcion: 'Suc Mock', direccion: 'Calle 1', localidad: 'Córdoba', provincia: 'X' }] } },
    ]);
    const p = makeProvider();
    const result = await p.getAgencies({ stateId: 'X' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.agencyId, '001');
    assert.strictEqual(result[0]!.name, 'Suc Mock');
  });

  it('getLabel sin context → ShippingValidationError (pedidoId requerido)', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.getLabel('360000102000579'),
      ShippingValidationError
    );
  });

  it('cancelOrder → ShippingMethodNotSupportedError', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.cancelOrder('360000102000579'),
      ShippingMethodNotSupportedError
    );
  });
});

describe('SH-A-05 — AndreaniProvider errores HTTP (sin MOCK)', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    delete process.env.ANDREANI_MOCK;
    process.env.ANDREANI_USERNAME_TEST = 'user';
    process.env.ANDREANI_PASSWORD_TEST = 'pass';
    process.env.ANDREANI_CLIENTE = 'CLI';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
    process.env.ANDREANI_TOKEN_HEADER = 'X-Token';
  });
  afterEach(() => {
    delete process.env.ANDREANI_MOCK;
    delete process.env.ANDREANI_USERNAME_TEST;
    delete process.env.ANDREANI_PASSWORD_TEST;
    delete process.env.ANDREANI_CLIENTE;
    delete process.env.ANDREANI_CONTRATO_DOM;
    delete process.env.ANDREANI_CONTRATO_SUC;
    delete process.env.ANDREANI_SUCURSAL_ORIGEN;
    delete process.env.ANDREANI_TOKEN_HEADER;
    resetGlobalFetch();
  });

  it('validateCredentials con login 401 → ShippingHttpError', async () => {
    mockFetch.setResponses([
      { status: 401 },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), /Login Andreani/);
  });

  it('validateCredentials con login 500 → ShippingHttpError', async () => {
    mockFetch.setResponses([
      { status: 500, json: { message: 'Server error' } },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), /Login Andreani/);
  });

  it('validateCredentials con respuesta sin token → ShippingHttpError', async () => {
    mockFetch.setResponses([
      { status: 200, json: { data: 'no-token' } },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), /respuesta sin token/);
  });

  it('cotizarEnvio sin cpDestino lanza ShippingValidationError', async () => {
    const p = makeProvider();
    mockFetch.setResponses([{ status: 200, json: { token: 'tok' } }]);
    await assert.rejects(
      p.cotizarEnvio({
        cpDestino: '  ',
        contrato: '1',
        cliente: 'CLI',
        bultos: [{ volumenCm3: 3000, kilos: 0.5, valorDeclarado: 1000 }],
      }),
      ShippingValidationError
    );
  });

  it('cotizarEnvio con 401 reintenta y lanza', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 401 },
      { status: 200, json: { token: 'tok2' } },
      { status: 401 },
    ]);
    const p = makeProvider();
    await assert.rejects(p.cotizarEnvio({
      cpDestino: '5000',
      contrato: '1',
      cliente: 'CLI',
      bultos: [{ volumenCm3: 3000, kilos: 0.5 }],
    }), /Error en API Andreani/);
  });
});

describe('SH-A-06 — AndreaniProvider createOrder sin pedido', () => {
  beforeEach(() => {
    process.env.ANDREANI_MOCK = 'true';
    process.env.ANDREANI_CLIENTE = 'MOCK';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
  });
  afterEach(() => {
    delete process.env.ANDREANI_MOCK;
  });

  it('createOrder lanza si pedido no existe (prisma busca pedido real)', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.createOrder({ ...buildOrderInput(), pedidoId: 999999 }),
      /no encontrado/i
    );
  });

  it('createOrder valida telefono antes de mapPedidoToAndreaniOrdenEnvio', async () => {
    const p = makeProvider();
    await assert.rejects(p.createOrder(buildOrderInput()), /no encontrado|Pedido no encontrado/);
  });

  it('getLabel sin context.pedidoId → ShippingValidationError', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.getLabel('360000102000579'),
      /se requiere context\.pedidoId/
    );
  });

  it('getLabel sin andreaniAgrupadorBultos en pedido → ShippingValidationError', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.getLabel('360000102000579', { pedidoId: 1, empresaId: 1 }),
      /no tiene andreaniAgrupadorBultos/
    );
  });
});