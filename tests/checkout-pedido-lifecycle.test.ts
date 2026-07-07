import assert from 'node:assert/strict';
import test from 'node:test';
import { FormaPago } from '@prisma/client';
import {
  computeCheckoutProductosACobrar,
  computeCheckoutTotalACobrar,
  resolveCheckoutPriceMode,
} from '../src/services/checkout-pedido-lifecycle.service';
import {
  computePedidoExpiresAt,
  getCheckoutPedidoExpiresHours,
  resolveCheckoutExpiresHours,
} from '../src/config/checkout-expires.config';
import { debeReservarStockLocal } from '../src/services/sync/pedido-stock-sync.util';
import { computeStockCacheConReservas } from '../src/services/sync/stock-reservas.util';

test('resolveCheckoutPriceMode — MP financiado usa lista', () => {
  assert.equal(resolveCheckoutPriceMode(FormaPago.mercado_pago, 'financiado'), 'lista');
});

test('resolveCheckoutPriceMode — MP transfer y manual usan transfer', () => {
  assert.equal(resolveCheckoutPriceMode(FormaPago.mercado_pago, 'transfer'), 'transfer');
  assert.equal(resolveCheckoutPriceMode(FormaPago.transferencia), 'transfer');
  assert.equal(resolveCheckoutPriceMode(FormaPago.efectivo), 'transfer');
});

test('computeCheckoutTotalACobrar — subtotal menos cupón más envío', () => {
  assert.equal(computeCheckoutProductosACobrar(1000, 100), 900);
  assert.equal(computeCheckoutTotalACobrar(1000, 100, 50), 950);
});

test('resolveCheckoutExpiresHours — default 48h unificado', () => {
  const keys = [
    'CHECKOUT_PEDIDO_EXPIRES_HOURS',
    'CHECKOUT_MP_EXPIRES_HOURS',
    'CHECKOUT_MANUAL_EXPIRES_HOURS',
    'CHECKOUT_MP_EXPIRES_MINUTES',
    'CHECKOUT_MANUAL_EXPIRES_DAYS',
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  process.env.CHECKOUT_PEDIDO_EXPIRES_HOURS = '48';
  try {
    assert.equal(getCheckoutPedidoExpiresHours(), 48);
    assert.equal(resolveCheckoutExpiresHours(FormaPago.mercado_pago), 48);
    assert.equal(resolveCheckoutExpiresHours(FormaPago.transferencia), 48);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test('computePedidoExpiresAt — suma horas desde fechaPedido', () => {
  const base = new Date('2026-01-01T12:00:00.000Z');
  const exp = computePedidoExpiresAt(FormaPago.transferencia, base);
  assert.equal(exp.getTime() - base.getTime(), resolveCheckoutExpiresHours(FormaPago.transferencia) * 3600000);
});

test('debeReservarStockLocal — no reservar si ya hay stockReservadoWeb', () => {
  assert.equal(
    debeReservarStockLocal({ esReintentoAprobacionErp: false, stockReservadoWeb: true }),
    false
  );
  assert.equal(
    debeReservarStockLocal({ esReintentoAprobacionErp: false, stockReservadoWeb: false }),
    true
  );
});

test('computeStockCacheConReservas — resta reservas activas', () => {
  assert.equal(computeStockCacheConReservas(10, 3), 7);
  assert.equal(computeStockCacheConReservas(2, 5), 0);
});
