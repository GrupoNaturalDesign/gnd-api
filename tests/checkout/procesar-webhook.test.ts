import { describe, it } from 'node:test';
import assert from 'node:assert';
import { procesarWebhookMercadoPago } from '../../src/services/mp-checkout.service';

describe('procesarWebhookMercadoPago — early returns', () => {
  it('no payment ID returns unknown status', async () => {
    const result = await procesarWebhookMercadoPago({}, {});
    assert.strictEqual(result.pedidoId, null);
    assert.strictEqual(result.paymentStatus, 'unknown');
    assert.strictEqual(result.procesado, false);
  });

  it('body without data.id returns unknown', async () => {
    const result = await procesarWebhookMercadoPago({ data: {} }, {});
    assert.strictEqual(result.pedidoId, null);
    assert.strictEqual(result.procesado, false);
  });

  it('query with non-numeric id ignored', async () => {
    const result = await procesarWebhookMercadoPago({}, { id: 'abc' });
    assert.strictEqual(result.pedidoId, null);
    assert.strictEqual(result.procesado, false);
  });
});
