import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OrderStatus } from '@prisma/client';
import { getOrderStatusEmailSubject, getOrderStatusUi } from '../src/emails/order-status-ui';

describe('order-status-ui', () => {
  it('getOrderStatusUi aplica overrides sobre el estado base', () => {
    const ui = getOrderStatusUi(OrderStatus.IN_PROCESS, {
      title: 'Listo para retirar',
      lead: 'Podés pasar a retirar.',
      icon: '📍',
    });

    assert.strictEqual(ui.title, 'Listo para retirar');
    assert.strictEqual(ui.lead, 'Podés pasar a retirar.');
    assert.strictEqual(ui.icon, '📍');
    assert.strictEqual(ui.bannerBg, '#ED3237');
  });

  it('getOrderStatusEmailSubject usa title override', () => {
    const subject = getOrderStatusEmailSubject(OrderStatus.IN_PROCESS, '#47', {
      title: 'Listo para retirar',
    });
    assert.strictEqual(subject, 'GND — Listo para retirar · #47');
  });

  it('getOrderStatusEmailSubject default para CONFIRMED', () => {
    const subject = getOrderStatusEmailSubject(OrderStatus.CONFIRMED, '#47');
    assert.strictEqual(subject, 'GND — Pedido confirmado · #47');
  });
});
