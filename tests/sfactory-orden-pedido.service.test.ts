import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEditarOrdenPedidoPayload,
  esEstadoPeAprobado,
  puedeReintentarAprobacionErp,
} from '../src/services/sfactory/sfactory-orden-pedido.service';
import { SFACTORY_PE_ESTADO } from '../src/services/sfactory/sfactory-orden-pedido.config';
import { EstadoPedido } from '@prisma/client';

test('buildEditarOrdenPedidoPayload fija estado aprobado y conserva items', () => {
  const remote = {
    data: {
      id: 99,
      estado: '1',
      titulo: 'WEB-54',
      observaciones: 'test',
    },
    items: [{ item_id: 1, descripcion: 'SKU', cantidad: '2' }],
  };
  const payload = buildEditarOrdenPedidoPayload(remote, {
    orderId: 99,
    nuevoEstado: SFACTORY_PE_ESTADO.aprobado,
  });
  assert.equal(payload.data.estado, '2');
  assert.equal(payload.data.id, 99);
  assert.equal(payload.items.length, 1);
});

test('puedeReintentarAprobacionErp solo fallido con orden y stock reservado', () => {
  assert.equal(
    puedeReintentarAprobacionErp({
      estadoInterno: EstadoPedido.fallido,
      sfactoryOrdenId: 10,
      stockReservadoWeb: true,
    }),
    true
  );
  assert.equal(
    puedeReintentarAprobacionErp({
      estadoInterno: EstadoPedido.fallido,
      sfactoryOrdenId: null,
      stockReservadoWeb: true,
    }),
    false
  );
  assert.equal(
    puedeReintentarAprobacionErp({
      estadoInterno: EstadoPedido.pendiente_confirmacion,
      sfactoryOrdenId: 10,
      stockReservadoWeb: false,
    }),
    false
  );
});

test('esEstadoPeAprobado', () => {
  assert.equal(esEstadoPeAprobado('2'), true);
  assert.equal(esEstadoPeAprobado('1'), false);
});
