import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ShippingMethodNotSupportedError } from '../../src/services/shipping/shipping.errors';

describe('shipping errors', () => {
  it('uses provider-neutral default message for unsupported operations', () => {
    const error = new ShippingMethodNotSupportedError();
    assert.equal(
      error.message,
      'Operacion de envio no soportada por el proveedor seleccionado'
    );
  });
});
