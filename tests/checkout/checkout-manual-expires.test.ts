import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  computeExpiresAtPedidoManual,
  getCheckoutManualExpiresHours,
} from '../../src/services/pedido-checkout.service';

describe('checkout manual expires (48h)', () => {
  const prev = process.env.CHECKOUT_MANUAL_EXPIRES_HOURS;

  afterEach(() => {
    if (prev === undefined) delete process.env.CHECKOUT_MANUAL_EXPIRES_HOURS;
    else process.env.CHECKOUT_MANUAL_EXPIRES_HOURS = prev;
  });

  it('default es 48 horas', () => {
    delete process.env.CHECKOUT_MANUAL_EXPIRES_HOURS;
    assert.strictEqual(getCheckoutManualExpiresHours(), 48);
  });

  it('computeExpiresAtPedidoManual suma horas corridas', () => {
    delete process.env.CHECKOUT_MANUAL_EXPIRES_HOURS;
    const base = new Date('2026-06-25T12:00:00.000Z');
    const expires = computeExpiresAtPedidoManual(base);
    assert.strictEqual(expires.getTime() - base.getTime(), 48 * 60 * 60 * 1000);
  });

  it('respeta CHECKOUT_MANUAL_EXPIRES_HOURS', () => {
    process.env.CHECKOUT_MANUAL_EXPIRES_HOURS = '72';
    const base = new Date('2026-06-25T12:00:00.000Z');
    const expires = computeExpiresAtPedidoManual(base);
    assert.strictEqual(expires.getTime() - base.getTime(), 72 * 60 * 60 * 1000);
  });
});
