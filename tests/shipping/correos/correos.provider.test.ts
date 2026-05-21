import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { CorreoProvider } from '../../../src/services/shipping/correo/correo.provider';
import {
  ShippingValidationError,
  ShippingHttpError,
  ShippingMethodNotSupportedError,
} from '../../../src/services/shipping/shipping.errors';
import type { CorreoQuoteInput } from '../../../src/services/shipping/correo/correo.types';
import type { CreateShippingOrderInput } from '../../../src/services/shipping/shipping.types';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

function makeProvider(env: 'test' | 'prod' = 'test'): CorreoProvider {
  return new CorreoProvider({ name: 'Test Sender' }, env, getMockFetch().fetch as unknown as typeof fetch);
}

function buildOrderInput(): CreateShippingOrderInput {
  return {
    pedidoId: 1,
    empresaId: 1,
    recipient: { name: 'Test', email: 'test@test.com', phone: '3510000000' },
    deliveryType: 'homeDelivery',
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

describe('SH-C-08 — CorreoProvider con CORREO_MOCK=true', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    process.env.CORREO_MOCK = 'true';
  });
  afterEach(() => {
    delete process.env.CORREO_MOCK;
    resetGlobalFetch();
  });

  it('getQuote devuelve array con mock', async () => {
    const p = makeProvider();
    const input: CorreoQuoteInput = {
      postalCodeOrigin: '5000',
      postalCodeDestination: '1000',
      dimensions: { weight: 500, height: 10, width: 15, length: 20 },
    };
    const result = await p.getQuote(input);
    assert.ok(result.length > 0);
    assert.strictEqual(result[0]!.serviceCode, 'MOCK');
    assert.strictEqual(result[0]!.price, 1000);
  });

  it('createOrder devuelve trackingNumber con mock', async () => {
    const p = makeProvider();
    const result = await p.createOrder(buildOrderInput());
    assert.strictEqual(result.provider, 'correo');
    assert.ok(result.trackingNumber);
  });

  it('getAgencies devuelve array vacío con mock', async () => {
    const p = makeProvider();
    const result = await p.getAgencies({ stateId: 'X' });
    assert.deepStrictEqual(result, []);
  });

  it('getTracking devuelve eventos vacíos con mock', async () => {
    const p = makeProvider();
    const result = await p.getTracking(['TN123', 'TN456']);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.trackingNumber, 'TN123');
    assert.strictEqual(result[1]!.trackingNumber, 'TN456');
    assert.deepStrictEqual(result[0]!.events, []);
    assert.deepStrictEqual(result[1]!.events, []);
  });

  it('importDryRun devuelve mock con dry-run', async () => {
    const p = makeProvider();
    const result = await p.importDryRun(buildOrderInput());
    assert.strictEqual((result as Record<string, unknown>)['mock'], true);
  });

  it('validateCredentials pasa con MOCK', async () => {
    const p = makeProvider();
    await p.validateCredentials();
  });
});

describe('SH-C-09 — CorreoProvider errores HTTP', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    delete process.env.CORREO_MOCK;
    process.env.CORREO_USERNAME_QA = 'user';
    process.env.CORREO_PASSWORD_QA = 'pass';
    process.env.CORREO_EMAIL_QA = 'test@test.com';
    process.env.CORREO_CUSTOMER_ID = '';
  });
  afterEach(() => {
    delete process.env.CORREO_MOCK;
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    delete process.env.CORREO_EMAIL_QA;
    delete process.env.CORREO_CUSTOMER_ID;
    resetGlobalFetch();
  });

  it('validateCredentials con token 401 → reintento + lanza', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 200, json: { token: 'tok2' } },
      { status: 200, json: { customerId: 'CID' } },
      { status: 401 },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), ShippingValidationError);
  });

  it('validateCredentials con HTTP 400 → ShippingValidationError', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 200, json: { token: 'tok2' } },
      { status: 200, json: { customerId: 'CID' } },
      { status: 400, json: { message: 'Bad request' } },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), ShippingValidationError);
  });

  it('validateCredentials con HTTP 500 → ShippingValidationError (envuelve HttpError)', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 200, json: { token: 'tok2' } },
      { status: 200, json: { customerId: 'CID' } },
      { status: 500, json: { error: 'Server error' } },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), ShippingValidationError);
  });

  it('validateCredentials con HTTP 503 → ShippingValidationError (envuelve HttpError)', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 200, json: { token: 'tok2' } },
      { status: 200, json: { customerId: 'CID' } },
      { status: 503, json: { message: 'Service unavailable' } },
    ]);
    const p = makeProvider();
    await assert.rejects(p.validateCredentials(), ShippingValidationError);
  });

  it('getQuote con 401 reintenta una vez y lanza ShippingHttpError al fallar de nuevo', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 200, json: { customerId: 'CID' } },
      { status: 401 },
      { status: 200, json: { token: 'tok2' } },
      { status: 401 },
      { status: 200, json: { token: 'tok3' } },
    ]);
    const p = makeProvider();
    const input: CorreoQuoteInput = {
      postalCodeOrigin: '5000',
      postalCodeDestination: '1000',
      dimensions: { weight: 500, height: 10, width: 15, length: 20 },
    };
    await assert.rejects(p.getQuote(input), ShippingHttpError);
  });
});

describe('SH-C-10 — getLabel / cancelOrder', () => {
  it('getLabel → ShippingMethodNotSupportedError', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.getLabel('TN123'),
      ShippingMethodNotSupportedError
    );
  });

  it('cancelOrder → ShippingMethodNotSupportedError', async () => {
    const p = makeProvider();
    await assert.rejects(
      p.cancelOrder('TN123'),
      ShippingMethodNotSupportedError
    );
  });
});

describe('SH-C-11 — importDryRun extOrderId TEST-*', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    process.env.CORREO_MOCK = 'true';
  });
  afterEach(() => {
    delete process.env.CORREO_MOCK;
    resetGlobalFetch();
  });

  it('importDryRun con mock devuelve mock=true', async () => {
    const p = makeProvider();
    const result = await p.importDryRun(buildOrderInput());
    assert.strictEqual((result as Record<string, unknown>)['mock'], true);
  });

  it('createOrder con mock persiste trackingNumber', async () => {
    const p = makeProvider();
    const result = await p.createOrder(buildOrderInput());
    assert.strictEqual(result.provider, 'correo');
    assert.ok(result.trackingNumber.length > 0);
  });
});