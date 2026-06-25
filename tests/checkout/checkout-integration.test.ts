import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseCheckoutEnvio,
  parseParcelForCheckout,
} from '../../src/utils/checkout-envio-parse.util';

const baseParcel = {
  weightGrams: 500,
  height: 10,
  width: 20,
  depth: 30,
  declaredValue: 1000,
};

const baseAddress = {
  streetName: 'Av. Colón',
  streetNumber: '100',
  city: 'Córdoba',
  state: 'Córdoba',
  zipCode: '5000',
};

describe('parseCheckoutEnvio', () => {
  it('andreani domicilio con address y parcel válidos', () => {
    const result = parseCheckoutEnvio({
      provider: 'andreani',
      deliveryType: 'homeDelivery',
      cpDestino: '5000',
      clientQuotedAmount: 1500,
      address: baseAddress,
      parcel: baseParcel,
    });
    assert.ok(result);
    assert.strictEqual(result!.provider, 'andreani');
    assert.strictEqual(result!.address?.streetNumber, '100');
  });

  it('andreani domicilio sin address retorna null', () => {
    assert.strictEqual(
      parseCheckoutEnvio({
        provider: 'andreani',
        deliveryType: 'homeDelivery',
        cpDestino: '5000',
        clientQuotedAmount: 1500,
      }),
      null
    );
  });

  it('andreani sucursal requiere agencyId', () => {
    assert.strictEqual(
      parseCheckoutEnvio({
        provider: 'andreani',
        deliveryType: 'agency',
        cpDestino: '5000',
        clientQuotedAmount: 800,
      }),
      null
    );
    const ok = parseCheckoutEnvio({
      provider: 'andreani',
      deliveryType: 'agency',
      cpDestino: '5000',
      clientQuotedAmount: 800,
      agencyId: 'suc-1',
    });
    assert.strictEqual(ok?.agencyId, 'suc-1');
  });

  it('rechaza provider inválido', () => {
    assert.strictEqual(
      parseCheckoutEnvio({
        provider: 'otro',
        deliveryType: 'homeDelivery',
        cpDestino: '5000',
        clientQuotedAmount: 100,
        address: baseAddress,
      }),
      null
    );
  });
});

describe('parseParcelForCheckout', () => {
  it('parsea peso y dimensiones correctas', () => {
    const result = parseParcelForCheckout(baseParcel);
    assert.ok(result);
    assert.strictEqual(result!.weightGrams, 500);
  });

  it('peso 0 retorna null', () => {
    assert.strictEqual(parseParcelForCheckout({ ...baseParcel, weightGrams: 0 }), null);
  });

  it('peso negativo retorna null', () => {
    assert.strictEqual(parseParcelForCheckout({ ...baseParcel, weightGrams: -1 }), null);
  });
});
