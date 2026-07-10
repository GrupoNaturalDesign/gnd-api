import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShippingConfigError,
  ShippingMethodNotSupportedError,
} from '../../src/services/shipping/shipping.errors';

describe('shipping errors', () => {
  it('uses provider-neutral default message for unsupported operations', () => {
    const error = new ShippingMethodNotSupportedError();
    assert.equal(
      error.message,
      'Operacion de envio no soportada por el proveedor seleccionado'
    );
  });

  it('ShippingConfigError expone code y httpStatus', () => {
    const error = new ShippingConfigError('falló integrador', {
      code: 'MICORREO_INTEGRATOR_UNAUTHORIZED',
      httpStatus: 503,
    });
    assert.equal(error.code, 'MICORREO_INTEGRATOR_UNAUTHORIZED');
    assert.equal(error.httpStatus, 503);
    assert.equal(error.message, 'falló integrador');
  });

  it('ShippingConfigError usa httpStatus 400 por defecto', () => {
    const error = new ShippingConfigError('config incompleta');
    assert.equal(error.httpStatus, 400);
    assert.equal(error.code, undefined);
  });
});
