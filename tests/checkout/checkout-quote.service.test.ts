import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assertMinoristaItemLimit,
  computeCheckoutQuoteTotals,
  CHECKOUT_MAX_MINORISTA_ITEMS,
  getCheckoutQuoteExpiresMinutes,
} from '../../src/services/checkout-quote.service';
import {
  parseCheckoutEnvio,
  parseCheckoutEnvioSelection,
} from '../../src/utils/checkout-envio-parse.util';

describe('computeCheckoutQuoteTotals', () => {
  it('calcula subtotal productos y total final con envío y cupón', () => {
    const r = computeCheckoutQuoteTotals(10000, 500, 1500);
    assert.strictEqual(r.subtotalProductos, 9500);
    assert.strictEqual(r.totalFinal, 11000);
  });

  it('sin cupón ni envío devuelve el subtotal', () => {
    const r = computeCheckoutQuoteTotals(2500, 0, 0);
    assert.strictEqual(r.subtotalProductos, 2500);
    assert.strictEqual(r.totalFinal, 2500);
  });
});

describe('assertMinoristaItemLimit', () => {
  it('acepta hasta el máximo de ítems', () => {
    assert.doesNotThrow(() =>
      assertMinoristaItemLimit([{ productoWebId: 1, cantidad: CHECKOUT_MAX_MINORISTA_ITEMS }])
    );
  });

  it('rechaza más ítems que el máximo', () => {
    assert.throws(
      () =>
        assertMinoristaItemLimit([
          { productoWebId: 1, cantidad: CHECKOUT_MAX_MINORISTA_ITEMS + 1 },
        ]),
      /admite hasta/
    );
  });
});

describe('getCheckoutQuoteExpiresMinutes', () => {
  it('default 15 minutos', () => {
    const prev = process.env.CHECKOUT_QUOTE_EXPIRES_MINUTES;
    delete process.env.CHECKOUT_QUOTE_EXPIRES_MINUTES;
    assert.strictEqual(getCheckoutQuoteExpiresMinutes(), 15);
    if (prev !== undefined) process.env.CHECKOUT_QUOTE_EXPIRES_MINUTES = prev;
  });
});

describe('parseCheckoutEnvioSelection', () => {
  const baseAddress = {
    streetName: 'Av. Siempre Viva',
    streetNumber: '742',
    city: 'Springfield',
    state: 'Springfield',
    zipCode: '5000',
  };

  it('domicilio andreani sin monto ni bulto', () => {
    const parsed = parseCheckoutEnvioSelection({
      provider: 'andreani',
      deliveryType: 'homeDelivery',
      cpDestino: '5000',
      address: baseAddress,
    });
    assert.ok(parsed);
    assert.strictEqual(parsed!.provider, 'andreani');
    assert.strictEqual(parsed!.cpDestino, '5000');
    assert.strictEqual('clientQuotedAmount' in parsed!, false);
    assert.strictEqual('parcel' in parsed!, false);
  });

  it('agency requiere agencyId', () => {
    assert.strictEqual(
      parseCheckoutEnvioSelection({
        provider: 'correo',
        deliveryType: 'agency',
        cpDestino: '5000',
      }),
      null
    );
    const ok = parseCheckoutEnvioSelection({
      provider: 'correo',
      deliveryType: 'agency',
      cpDestino: '5000',
      agencyId: 'SUC-1',
    });
    assert.ok(ok);
    assert.strictEqual(ok!.agencyId, 'SUC-1');
  });

  it('parseCheckoutEnvio exige clientQuotedAmount', () => {
    assert.strictEqual(
      parseCheckoutEnvio({
        provider: 'andreani',
        deliveryType: 'homeDelivery',
        cpDestino: '5000',
        address: baseAddress,
      }),
      null
    );
    const withAmount = parseCheckoutEnvio({
      provider: 'andreani',
      deliveryType: 'homeDelivery',
      cpDestino: '5000',
      clientQuotedAmount: 1200,
      address: baseAddress,
    });
    assert.ok(withAmount);
    assert.strictEqual(withAmount!.clientQuotedAmount, 1200);
  });
});
