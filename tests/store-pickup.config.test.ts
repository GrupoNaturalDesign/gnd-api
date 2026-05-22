import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  buildStorePickupConfirmInstructions,
  buildStorePickupReadyInstructions,
  formatPedidoNumero,
  getStorePickupAddress,
} from '../src/lib/store-pickup.config';

describe('store-pickup.config', () => {
  const prev = process.env.STORE_PICKUP_ADDRESS;

  afterEach(() => {
    if (prev === undefined) delete process.env.STORE_PICKUP_ADDRESS;
    else process.env.STORE_PICKUP_ADDRESS = prev;
  });

  it('formatPedidoNumero usa sfactoryExternalOrderId si existe', () => {
    assert.strictEqual(formatPedidoNumero(47, 'WEB-47'), 'WEB-47');
    assert.strictEqual(formatPedidoNumero(47, null), 'WEB-47');
    assert.strictEqual(formatPedidoNumero(47, '  '), 'WEB-47');
  });

  it('getStorePickupAddress usa env o default', () => {
    delete process.env.STORE_PICKUP_ADDRESS;
    assert.strictEqual(getStorePickupAddress(), 'Alta Córdoba, Córdoba Capital.');

    process.env.STORE_PICKUP_ADDRESS = '  Calle Test 123  ';
    assert.strictEqual(getStorePickupAddress(), 'Calle Test 123');
  });

  it('buildStorePickupReadyInstructions incluye ref y dirección', () => {
    delete process.env.STORE_PICKUP_ADDRESS;
    const text = buildStorePickupReadyInstructions('WEB-47');
    assert.ok(text.includes('WEB-47'));
    assert.ok(text.includes('Alta Córdoba'));
    assert.ok(text.includes('DNI'));
  });

  it('buildStorePickupConfirmInstructions incluye aviso de email', () => {
    const text = buildStorePickupConfirmInstructions('WEB-47');
    assert.ok(text.includes('Te avisaremos por email cuando esté listo para retirar'));
  });
});
