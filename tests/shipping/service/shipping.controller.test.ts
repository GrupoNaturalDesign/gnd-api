import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { shippingController } from '../../../src/controllers/shipping.controller';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

function makeMockResponse() {
  let _statusCode = 0;
  let _jsonData: unknown;
  return {
    get statusCode() { return _statusCode; },
    get jsonData() { return _jsonData; },
    status(code: number) {
      _statusCode = code;
      return this;
    },
    json(data: unknown) {
      _jsonData = data;
    },
  };
}

function makeMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: 1,
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

describe('SH-S-02 — ShippingController', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    (globalThis as Record<string, unknown>).fetch = mockFetch.fetch;
    process.env.ANDREANI_MOCK = 'true';
    process.env.ANDREANI_CLIENTE = 'MOCK';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
  });
  afterEach(() => {
    delete process.env.ANDREANI_MOCK;
    delete process.env.ANDREANI_CLIENTE;
    delete process.env.ANDREANI_CONTRATO_DOM;
    delete process.env.ANDREANI_CONTRATO_SUC;
    delete process.env.ANDREANI_SUCURSAL_ORIGEN;
    resetGlobalFetch();
  });

  describe('createOrder', () => {
    it('403 si falta empresaId', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ empresaId: undefined });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 403);
    });

    it('400 si body no tiene pedidoId', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ body: { deliveryType: 'homeDelivery', recipient: { name: 'T' }, parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 } } });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });

    it('400 si body no tiene recipient.name', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ body: { pedidoId: 1, deliveryType: 'homeDelivery', recipient: { name: '' }, parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 } } });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });

    it('400 si parcel tiene weightGrams invalido', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ body: { pedidoId: 1, deliveryType: 'homeDelivery', recipient: { name: 'Test' }, parcel: { weightGrams: 0, height: 10, width: 15, depth: 20, declaredValue: 1000 } } });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });

    it('400 si deliveryType no es homeDelivery ni agency', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ body: { pedidoId: 1, deliveryType: 'invalid', recipient: { name: 'Test' }, parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 } } });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('quote', () => {
    it('403 si falta empresaId', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ empresaId: undefined });
      await shippingController.quote(req as never, res as never);
      assert.strictEqual(res.statusCode, 403);
    });

    it('400 si cpDestino muy corto', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ body: { cpDestino: '1', deliveryType: 'homeDelivery', parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 } } });
      await shippingController.quote(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('getOrderLabel', () => {
    it('403 si falta empresaId', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ empresaId: undefined });
      await shippingController.getOrderLabel(req as never, res as never);
      assert.strictEqual(res.statusCode, 403);
    });

    it('400 si pedidoId no es numero', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ params: { pedidoId: 'abc' } });
      await shippingController.getOrderLabel(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('getOrderTracking', () => {
    it('400 si pedidoId no es numero', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ params: { pedidoId: 'xyz' } });
      await shippingController.getOrderTracking(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
    });
  });

  describe('getAgencies', () => {
    it('403 si falta empresaId', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({ empresaId: undefined });
      await shippingController.getAgencies(req as never, res as never);
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('error mapping', () => {
    it('ShippingValidationError → 400', async () => {
      const res = makeMockResponse();
      const req = makeMockRequest({
        body: { pedidoId: 999999, deliveryType: 'homeDelivery', recipient: { name: 'Test' }, parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 } },
      });
      await shippingController.createOrder(req as never, res as never);
      assert.strictEqual(res.statusCode, 400);
      const d = res.jsonData as Record<string, unknown>;
      assert.strictEqual(d.success, false);
      assert.ok(d.message);
    });
  });
});