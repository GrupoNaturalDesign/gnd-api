import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveSfactoryPedidoFulfillmentMode } from '../../src/utils/sfactory-pedido-externo.util';
import { toSfactoryPedidoExternoParams } from '../../src/validation/sfactory-pedido-externo.schema';

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
