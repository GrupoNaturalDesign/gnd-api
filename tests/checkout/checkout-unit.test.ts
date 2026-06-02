import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractMercadoPagoPaymentId,
  buildWebhookDedupeKey,
  extractPedidoIdFromExternalReference,
  splitNombreApellido,
} from '../../src/services/mp-checkout.service';

describe('extractMercadoPagoPaymentId', () => {
  it('from query.id — numeric string', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({}, { id: '123456' }), '123456');
  });

  it('query.id non-numeric — falls back to body.data.id', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({ data: { id: '789' } }, { id: 'abc' }), '789');
  });

  it('from body.data.id — numeric string', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({ data: { id: '789' } }, {}), '789');
  });

  it('from body.data.id — number type', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({ data: { id: 456 } }, {}), '456');
  });

  it('no id available — returns null', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({}, {}), null);
  });

  it('body is null — does not throw', () => {
    assert.strictEqual(extractMercadoPagoPaymentId(null, {}), null);
  });

  it('body.data present but id missing', () => {
    assert.strictEqual(extractMercadoPagoPaymentId({ data: {} }, {}), null);
  });
});

describe('buildWebhookDedupeKey', () => {
  it('x-request-id wins over paymentId', () => {
    const key = buildWebhookDedupeKey({ 'x-request-id': 'req-abc-123' }, { action: 'payment', type: 'payment' }, 'pay-1');
    assert.strictEqual(key, 'mp:rid:req-abc-123');
  });

  it('x-request-id with whitespace', () => {
    assert.strictEqual(buildWebhookDedupeKey({ 'x-request-id': '  spaced-rid  ' }, {}, null), 'mp:rid:spaced-rid');
  });

  it('paymentId path — uses body.action and body.type', () => {
    assert.strictEqual(buildWebhookDedupeKey({}, { action: 'payment.created', type: 'payment' }, 'pay-42'), 'mp:pay:pay-42:payment:payment.created');
  });

  it('paymentId with no action/type', () => {
    assert.strictEqual(buildWebhookDedupeKey({}, {}, 'pay-1'), 'mp:pay:pay-1::');
  });

  it('fallback anon — no rid, no paymentId', () => {
    const key = buildWebhookDedupeKey({}, {}, null);
    assert.ok(key.startsWith('mp:anon:'));
  });

  it('non-object body does not throw', () => {
    assert.strictEqual(buildWebhookDedupeKey({}, 'not-an-object', 'pay-1'), 'mp:pay:pay-1::');
  });
});

describe('extractPedidoIdFromExternalReference', () => {
  it('valid pedido_N format', () => {
    assert.strictEqual(extractPedidoIdFromExternalReference('pedido_42'), 42);
    assert.strictEqual(extractPedidoIdFromExternalReference('pedido_1'), 1);
    assert.strictEqual(extractPedidoIdFromExternalReference('pedido_999999'), 999999);
  });

  it('null or undefined returns null', () => {
    assert.strictEqual(extractPedidoIdFromExternalReference(null), null);
    assert.strictEqual(extractPedidoIdFromExternalReference(undefined), null);
  });

  it('invalid formats return null', () => {
    assert.strictEqual(extractPedidoIdFromExternalReference('pedido_'), null);
    assert.strictEqual(extractPedidoIdFromExternalReference('pedido_abc'), null);
    assert.strictEqual(extractPedidoIdFromExternalReference('PEDIDO_42'), null);
    assert.strictEqual(extractPedidoIdFromExternalReference('order_42'), null);
    assert.strictEqual(extractPedidoIdFromExternalReference(''), null);
  });
});

describe('splitNombreApellido', () => {
  it('first and last name', () => {
    const r = splitNombreApellido('Juan Pérez');
    assert.strictEqual(r.name, 'Juan');
    assert.strictEqual(r.surname, 'Pérez');
  });

  it('multiple surname parts', () => {
    const r = splitNombreApellido('María de los Ángeles Gómez');
    assert.strictEqual(r.name, 'María');
    assert.strictEqual(r.surname, 'de los Ángeles Gómez');
  });

  it('single word — surname falls back to "-"', () => {
    const r = splitNombreApellido('Socrates');
    assert.strictEqual(r.name, 'Socrates');
    assert.strictEqual(r.surname, '-');
  });

  it('empty string — fallback Cliente/GND', () => {
    const r = splitNombreApellido('');
    assert.strictEqual(r.name, 'Cliente');
    assert.strictEqual(r.surname, 'GND');
  });

  it('whitespace only — fallback Cliente/GND', () => {
    const r = splitNombreApellido('   ');
    assert.strictEqual(r.name, 'Cliente');
    assert.strictEqual(r.surname, 'GND');
  });
});
