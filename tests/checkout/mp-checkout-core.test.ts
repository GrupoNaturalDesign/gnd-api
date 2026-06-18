import { describe, it } from 'node:test';
import assert from 'node:assert';
import { crearPedidoMp, crearPedidoManual } from '../../src/services/mp-checkout.service';

describe('crearPedidoMp — input validation', () => {
  it('empty items throws early', async () => {
    await assert.rejects(
      () => crearPedidoMp({ empresaId: 1, clienteNombre: 'Test', clienteEmail: 'a@b.com', items: [], mpPricingMode: 'financiado' }, 1),
      { message: 'El pedido debe incluir al menos un ítem' }
    );
  });
});

describe('crearPedidoManual — input validation', () => {
  it('empty items throws early', async () => {
    await assert.rejects(
      () =>
        crearPedidoManual(
          {
            empresaId: 1,
            clienteNombre: 'Test',
            clienteEmail: 'a@b.com',
            items: [],
            formaPago: 'efectivo',
          },
          1
        ),
      { message: 'El pedido debe incluir al menos un ítem' }
    );
  });
});
