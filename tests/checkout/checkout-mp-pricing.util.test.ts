import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assertMpPricingMode,
  buildMercadoPagoPaymentMethodsForMode,
  expectedUnitPriceForMpMode,
  unitPriceMatchesMpMode,
} from '../../src/utils/checkout-mp-pricing.util';

describe('checkout-mp-pricing.util', () => {
  it('assertMpPricingMode acepta transfer y financiado', () => {
    assert.strictEqual(assertMpPricingMode('transfer'), 'transfer');
    assert.strictEqual(assertMpPricingMode('financiado'), 'financiado');
  });

  it('assertMpPricingMode rechaza valores inválidos', () => {
    assert.throws(() => assertMpPricingMode('lista'), /inválido/);
    assert.throws(() => assertMpPricingMode(undefined), /inválido/);
  });

  it('buildMercadoPagoPaymentMethodsForMode — transfer excluye tarjeta', () => {
    const pm = buildMercadoPagoPaymentMethodsForMode('transfer', 6);
    assert.deepStrictEqual(pm, {
      installments: 1,
      excluded_payment_types: [{ id: 'credit_card' }],
    });
  });

  it('buildMercadoPagoPaymentMethodsForMode — financiado con cuotas', () => {
    const pm = buildMercadoPagoPaymentMethodsForMode('financiado', 6);
    assert.deepStrictEqual(pm, {
      default_installments: 6,
      installments: 6,
      excluded_payment_types: [{ id: 'bank_transfer' }],
    });
  });

  it('expectedUnitPriceForMpMode elige lista o transfer', () => {
    assert.strictEqual(expectedUnitPriceForMpMode(100, 85, 'financiado'), 100);
    assert.strictEqual(expectedUnitPriceForMpMode(100, 85, 'transfer'), 85);
    assert.strictEqual(expectedUnitPriceForMpMode(100, null, 'transfer'), 100);
  });

  it('unitPriceMatchesMpMode tolera centavos', () => {
    assert.strictEqual(unitPriceMatchesMpMode(85, 100, 85, 'transfer'), true);
    assert.strictEqual(unitPriceMatchesMpMode(100.04, 100, 85, 'financiado'), true);
    assert.strictEqual(unitPriceMatchesMpMode(90, 100, 85, 'transfer'), false);
  });
});
