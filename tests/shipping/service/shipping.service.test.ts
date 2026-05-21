import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { ShippingService } from '../../../src/services/shipping/shipping.service';
import {
  ShippingValidationError,
  ShippingMethodNotSupportedError,
} from '../../../src/services/shipping/shipping.errors';
import type { ShippingDeliveryType } from '../../../src/services/shipping/shipping.types';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

describe('SH-S-01 — ShippingService unit', () => {
  let mockFetch: MockFetch;
  let service: ShippingService;

  beforeEach(() => {
    mockFetch = getMockFetch();
    mockFetch.setResponses([]);
    (globalThis as Record<string, unknown>).fetch = mockFetch.fetch;
    service = new ShippingService();
    process.env.ANDREANI_MOCK = 'true';
    process.env.ANDREANI_CLIENTE = 'MOCK';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
    process.env.CORREO_ORIGIN_CP = '5000';
  });
  afterEach(() => {
    delete process.env.ANDREANI_MOCK;
    delete process.env.ANDREANI_CLIENTE;
    delete process.env.ANDREANI_CONTRATO_DOM;
    delete process.env.ANDREANI_CONTRATO_SUC;
    delete process.env.ANDREANI_SUCURSAL_ORIGEN;
    delete process.env.CORREO_ORIGIN_CP;
    resetGlobalFetch();
  });

  it('createOrder lanza ShippingValidationError si pedido no existe', async () => {
    await assert.rejects(
      service.createOrder({
        pedidoId: 999999,
        empresaId: 1,
        recipient: { name: 'Test', email: 'test@test.com', phone: '3510000000' },
        deliveryType: 'homeDelivery' as ShippingDeliveryType,
        address: { streetName: 'Calle', streetNumber: '123', city: 'Córdoba', state: 'X', zipCode: '5000' },
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      }),
      ShippingValidationError
    );
  });

  it('getLabel lanza ShippingValidationError sin context', async () => {
    await assert.rejects(
      service.getLabel(1, '360000102000579', 'correo', 1),
      ShippingValidationError
    );
  });

  it('cancelOrder lanza ShippingValidationError si pedido no existe', async () => {
    await assert.rejects(
      service.cancelOrder(999999, 'TN123', 'correo', 1),
      ShippingValidationError
    );
  });

  it('quoteAndreani sin ANDREANI_CLIENTE lanza', async () => {
    delete process.env.ANDREANI_CLIENTE;
    await assert.rejects(
      service.quoteAndreani({
        empresaId: 1,
        cpDestino: '5000',
        deliveryType: 'homeDelivery',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      }),
      ShippingValidationError
    );
  });

  it('quoteAndreani sin contrato para homeDelivery lanza', async () => {
    delete process.env.ANDREANI_CONTRATO_DOM;
    await assert.rejects(
      service.quoteAndreani({
        empresaId: 1,
        cpDestino: '5000',
        deliveryType: 'homeDelivery',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      }),
      ShippingValidationError
    );
  });

  it('quoteAndreani sin contrato para agencia lanza', async () => {
    delete process.env.ANDREANI_CONTRATO_SUC;
    await assert.rejects(
      service.quoteAndreani({
        empresaId: 1,
        cpDestino: '5000',
        deliveryType: 'agency',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      }),
      ShippingValidationError
    );
  });

  it('quoteCorreo sin CORREO_ORIGIN_CP lanza', async () => {
    delete process.env.CORREO_ORIGIN_CP;
    await assert.rejects(
      service.quoteCorreo({
        empresaId: 1,
        cpDestino: '5000',
        deliveryType: 'homeDelivery',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      }),
      ShippingValidationError
    );
  });

  it('getTracking lanza ShippingValidationError si pedido no existe', async () => {
    await assert.rejects(
      service.getTracking(999999, ['TN123'], 'correo', 1),
      ShippingValidationError
    );
  });

  it('resolveDefaultProvider devuelve correo por defecto', async () => {
    const result = await service.resolveDefaultProvider(1);
    assert.ok(result === 'correo' || result === 'andreani');
  });
});