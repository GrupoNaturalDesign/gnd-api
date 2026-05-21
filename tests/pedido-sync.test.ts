import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderStatus } from '@prisma/client';
import {
  crearPedidoManualSchema,
  mapRemoteOrderStatus,
  resolverFallidoSchema,
} from '../src/services/pedido-sync.service';

test('mapRemoteOrderStatus maps SFactory PE numeric states', () => {
  assert.equal(mapRemoteOrderStatus('1'), OrderStatus.PENDING);
  assert.equal(mapRemoteOrderStatus('2'), OrderStatus.CONFIRMED);
  assert.equal(mapRemoteOrderStatus('3'), OrderStatus.DELIVERED);
  assert.equal(mapRemoteOrderStatus('4'), OrderStatus.CANCELLED);
  assert.equal(mapRemoteOrderStatus('5'), OrderStatus.IN_PROCESS);
  assert.equal(mapRemoteOrderStatus('6'), OrderStatus.SHIPPED);
});

test('resolverFallidoSchema defaults to reintentar', () => {
  assert.deepEqual(resolverFallidoSchema.parse({}), { accion: 'reintentar' });
  assert.deepEqual(resolverFallidoSchema.parse({ accion: 'cancelar', motivo: 'sin stock' }), {
    accion: 'cancelar',
    motivo: 'sin stock',
  });
});

test('crearPedidoManualSchema validates a minimal manual order', () => {
  const parsed = crearPedidoManualSchema.parse({
    clienteNombre: 'Cliente Demo',
    clienteEmail: 'cliente@example.com',
    items: [
      {
        sfactoryItemId: 123,
        nombre: 'Ambo azul',
        codigo: 'SKU-1',
        cantidad: 2,
        precioUnitario: 1000,
      },
    ],
  });

  assert.equal(parsed.formaPago, 'transferencia');
  assert.equal(parsed.items[0]?.codigo, 'SKU-1');
});
