import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutShippingController } from '../../../src/controllers/checkout-shipping.controller';
import { ShippingConfigError } from '../../../src/services/shipping/shipping.errors';
import * as checkoutShippingService from '../../../src/services/checkout-shipping.service';
import * as checkoutEmpresa from '../../../src/lib/checkout-empresa';

function makeMockResponse() {
  let statusCode = 0;
  let jsonData: unknown;
  return {
    get statusCode() {
      return statusCode;
    },
    get jsonData() {
      return jsonData;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      jsonData = data;
    },
  };
}

describe('checkout-shipping.controller — errores de configuración', () => {
  let originalQuote: typeof checkoutShippingService.quoteCheckoutShipping;
  let originalEmpresaId: typeof checkoutEmpresa.getCheckoutEmpresaIdFromEnv;

  beforeEach(() => {
    originalQuote = checkoutShippingService.quoteCheckoutShipping;
    originalEmpresaId = checkoutEmpresa.getCheckoutEmpresaIdFromEnv;
    Object.defineProperty(checkoutShippingService, 'quoteCheckoutShipping', {
      configurable: true,
      value: async () => {
        throw new ShippingConfigError('integrador 401', {
          code: 'MICORREO_INTEGRATOR_UNAUTHORIZED',
          httpStatus: 503,
        });
      },
    });
    Object.defineProperty(checkoutEmpresa, 'getCheckoutEmpresaIdFromEnv', {
      configurable: true,
      value: () => 1,
    });
  });

  afterEach(() => {
    Object.defineProperty(checkoutShippingService, 'quoteCheckoutShipping', {
      configurable: true,
      value: originalQuote,
    });
    Object.defineProperty(checkoutEmpresa, 'getCheckoutEmpresaIdFromEnv', {
      configurable: true,
      value: originalEmpresaId,
    });
  });

  it('quote mapea ShippingConfigError a httpStatus y code en JSON', async () => {
    const res = makeMockResponse();
    const req = {
      body: {
        provider: 'correo',
        deliveryType: 'homeDelivery',
        items: [{ productoWebId: 1, cantidad: 1 }],
        declaredValueSubtotal: 1000,
        cpDestino: '5000',
      },
    };

    await checkoutShippingController.quote(req as never, res as never);

    assert.equal(res.statusCode, 503);
    const body = res.jsonData as {
      success: boolean;
      code?: string;
      message: string;
    };
    assert.equal(body.success, false);
    assert.equal(body.code, 'MICORREO_INTEGRATOR_UNAUTHORIZED');
    assert.match(body.message, /integrador 401/);
  });
});
