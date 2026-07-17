import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computePedidoDescuentoTotal,
  computePedidoTotalNeto,
} from '../src/utils/pedido-totals.util';

describe('pedido-totals.util', () => {
  it('descuento prioriza campo descuento y no suma cuponDescuentoTotal', () => {
    assert.equal(
      computePedidoDescuentoTotal({
        total: 39941.5,
        descuento: 19970.75,
        cuponDescuentoTotal: 19970.75,
      }),
      19970.75
    );
  });

  it('total neto = total bruto − descuento (pedido con cupón 50%)', () => {
    assert.equal(
      computePedidoTotalNeto({
        total: 39941.5,
        descuento: 19970.75,
        cuponDescuentoTotal: 19970.75,
      }),
      19970.75
    );
  });

  it('sin descuento devuelve el total bruto', () => {
    assert.equal(computePedidoTotalNeto({ total: 1000, descuento: 0 }), 1000);
  });

  it('cae a cuponDescuentoTotal si descuento es 0', () => {
    assert.equal(
      computePedidoTotalNeto({
        total: 1000,
        descuento: 0,
        cuponDescuentoTotal: 200,
      }),
      800
    );
  });
});
