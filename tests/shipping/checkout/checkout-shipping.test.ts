import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  mapFormaEnvioCheckout,
  CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS,
} from '../../../src/services/checkout-shipping.service';

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
  it('CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS = 2.5', () => {
    assert.strictEqual(CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS, 2.5);
  });
});
