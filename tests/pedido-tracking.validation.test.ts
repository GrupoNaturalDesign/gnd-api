import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setPedidoTrackingSchema } from '../src/validation/pedido-tracking.validation';

describe('setPedidoTrackingSchema', () => {
  it('acepta correo + tracking', () => {
    const r = setPedidoTrackingSchema.parse({
      provider: 'correo',
      trackingNumber: '  ABC-123  ',
    });
    assert.strictEqual(r.provider, 'correo');
    assert.strictEqual(r.trackingNumber, 'ABC-123');
  });

  it('rechaza tracking vacío', () => {
    assert.throws(() =>
      setPedidoTrackingSchema.parse({ provider: 'andreani', trackingNumber: '   ' })
    );
  });
});
