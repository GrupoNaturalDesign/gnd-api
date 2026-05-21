import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCuponDetalleSnapshot,
  sfactoryDescuentoPctFromCuponLine,
  sfactoryDescuentoPctGlobal,
} from '../src/utils/cupon-sfactory-payload';

const detalle = {
  cuponId: 1,
  codigo: 'HOTSALE',
  nombre: 'HOTSALE',
  tipoDescuento: 'porcentaje',
  valorDescuento: 10,
  alcance: 'carrito_completo',
  descuentoTotal: 8000,
  itemsAplicados: 1,
  detallePorItem: [
    {
      productoId: 1965,
      cantidad: 1,
      precioOriginal: 80000,
      descuento: 8000,
      precioFinal: 72000,
    },
  ],
};

test('parseCuponDetalleSnapshot acepta snapshot válido', () => {
  assert.equal(parseCuponDetalleSnapshot(detalle)?.codigo, 'HOTSALE');
});

test('sfactoryDescuentoPctFromCuponLine devuelve 10 para 10% sobre la línea', () => {
  assert.equal(sfactoryDescuentoPctFromCuponLine(1965, detalle), 10);
});

test('sfactoryDescuentoPctFromCuponLine capa en 100', () => {
  const full = {
    ...detalle,
    detallePorItem: [
      {
        productoId: 1,
        cantidad: 1,
        precioOriginal: 100,
        descuento: 100,
        precioFinal: 0,
      },
    ],
  };
  assert.equal(sfactoryDescuentoPctFromCuponLine(1, full), 100);
});

test('sfactoryDescuentoPctGlobal reparte descuento sobre subtotal', () => {
  assert.equal(sfactoryDescuentoPctGlobal(80000, 8000), 10);
});

test('no envía descuento si producto no está en snapshot', () => {
  assert.equal(sfactoryDescuentoPctFromCuponLine(999, detalle), undefined);
});
