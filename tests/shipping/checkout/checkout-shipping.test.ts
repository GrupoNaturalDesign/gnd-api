import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  validateCheckoutEnvioForMp,
  mapFormaEnvioCheckout,
  CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS,
} from '../../../src/services/checkout-shipping.service';
import { Prisma } from '@prisma/client';

describe('SH-CH-04 — mapFormaEnvioCheckout', () => {
  it('correos + domicilio → correo_domicilio', () => {
    const result = mapFormaEnvioCheckout('correo', 'homeDelivery');
    assert.strictEqual(result, 'correo_domicilio');
  });
  it('correos + sucursal → correo_sucursal', () => {
    const result = mapFormaEnvioCheckout('correo', 'agency');
    assert.strictEqual(result, 'correo_sucursal');
  });
  it('andreani + domicilio → andreani_domicilio', () => {
    const result = mapFormaEnvioCheckout('andreani', 'homeDelivery');
    assert.strictEqual(result, 'andreani_domicilio');
  });
  it('andreani + sucursal → andreani_sucursal', () => {
    const result = mapFormaEnvioCheckout('andreani', 'agency');
    assert.strictEqual(result, 'andreani_sucursal');
  });
});

describe('SH-CH-02 — validateCheckoutEnvioForMp', () => {
  beforeEach(() => {
    process.env.CORREO_MOCK = 'true';
    process.env.ANDREANI_MOCK = 'true';
    process.env.ANDREANI_CLIENTE = 'MOCK';
    process.env.ANDREANI_CONTRATO_DOM = '1';
    process.env.ANDREANI_CONTRATO_SUC = '2';
    process.env.ANDREANI_SUCURSAL_ORIGEN = '5000';
  });

  it('diferencia 0 ARS → OK', async () => {
    const result = await validateCheckoutEnvioForMp(1, {
      provider: 'correo',
      deliveryType: 'homeDelivery',
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      cpDestino: '5000',
      clientQuotedAmount: 1000,
    });
    assert.ok(result.costoEnvio);
    assert.strictEqual(result.formaEnvio, 'correo_domicilio');
  });

  it('diferencia 2.5 ARS → OK (tolerancia)', async () => {
    const result = await validateCheckoutEnvioForMp(1, {
      provider: 'correo',
      deliveryType: 'homeDelivery',
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      cpDestino: '5000',
      clientQuotedAmount: 1002.49,
    });
    assert.ok(result.costoEnvio);
  });

  it('diferencia > 2.5 ARS → ShippingValidationError', async () => {
    await assert.rejects(
      validateCheckoutEnvioForMp(1, {
        provider: 'correo',
        deliveryType: 'homeDelivery',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
        cpDestino: '5000',
        clientQuotedAmount: 990,
      }),
      /costo de envío cambió/
    );
  });

  it('diferencia 3 ARS → rechazo', async () => {
    await assert.rejects(
      validateCheckoutEnvioForMp(1, {
        provider: 'correo',
        deliveryType: 'homeDelivery',
        parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
        cpDestino: '5000',
        clientQuotedAmount: 997,
      }),
      /costo de envío cambió/
    );
  });

  it('devuelve snapshot con version=1', async () => {
    const result = await validateCheckoutEnvioForMp(1, {
      provider: 'correo',
      deliveryType: 'homeDelivery',
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      cpDestino: '5000',
      clientQuotedAmount: 1000,
    });
    const snap = result.snapshot as Record<string, unknown>;
    assert.strictEqual(snap.version, 1);
    assert.strictEqual(snap.provider, 'correo');
    assert.strictEqual(snap.deliveryType, 'homeDelivery');
  });

  it('Andreani también funciona', async () => {
    const result = await validateCheckoutEnvioForMp(1, {
      provider: 'andreani',
      deliveryType: 'homeDelivery',
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      cpDestino: '5000',
      clientQuotedAmount: 1000,
    });
    assert.strictEqual(result.formaEnvio, 'andreani_domicilio');
  });

  it('costoEnvio es Prisma.Decimal', async () => {
    const result = await validateCheckoutEnvioForMp(1, {
      provider: 'correo',
      deliveryType: 'homeDelivery',
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
      cpDestino: '5000',
      clientQuotedAmount: 1000,
    });
    assert.ok(result.costoEnvio instanceof Prisma.Decimal);
  });

  it('CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS = 2.5', () => {
    assert.strictEqual(CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS, 2.5);
  });
});