import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveSfactoryPedidoFulfillmentMode } from '../../src/utils/sfactory-pedido-externo.util';
import {
  normalizeSfactoryClienteEmail,
  sfactoryPedidoExternoClienteSchema,
  toSfactoryPedidoExternoParams,
} from '../../src/validation/sfactory-pedido-externo.schema';

afterEach(() => {
  delete process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE;
});

test('resolveSfactoryPedidoFulfillmentMode defaults to none', () => {
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'none');
});

test('resolveSfactoryPedidoFulfillmentMode reads env', () => {
  process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE = 'deliver';
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'deliver');
});

test('resolveSfactoryPedidoFulfillmentMode ignores invalid env', () => {
  process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE = 'invalid';
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'none');
});

test('toSfactoryPedidoExternoParams includes fulfillment_mode none by default', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    cliente: { email: 'a@b.com', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.fulfillment_mode, 'none');
});

test('toSfactoryPedidoExternoParams respects body fulfillment_mode override', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    fulfillment_mode: 'reserve',
    cliente: { email: 'a@b.com', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.fulfillment_mode, 'reserve');
});

test('normalizeSfactoryClienteEmail omits placeholders and invalid', () => {
  assert.equal(normalizeSfactoryClienteEmail('-'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('sin email'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('no-es-mail'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('ok@example.com'), 'ok@example.com');
});

test('cliente schema rejects invalid email even with valid cuit', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: '20123456789',
    email: 'no-es-mail',
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(
      parsed.error.issues[0]?.message ?? '',
      /email del cliente no tiene un formato válido/
    );
  }
});

test('cliente schema accepts cuit with placeholder email', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: '20123456789',
    email: '-',
  });
  assert.equal(parsed.success, true);
});

test('toSfactoryPedidoExternoParams omits placeholder email', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    cliente: { cuit: '20123456789', email: '-', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.cliente.email, undefined);
  assert.equal(params.cliente.cuit, '20123456789');
});
