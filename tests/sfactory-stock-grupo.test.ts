import assert from 'node:assert/strict';
import test from 'node:test';
import { agruparProductosPorCodigoBase } from '../src/services/producto-agrupacion.service';
import {
  inventarioDesdeStockRow,
  resolverCodigosPermitidosDeposito,
  resolverGruposConStock,
} from '../src/utils/sfactory-stock-fetch.utils';
import type { SFactoryProduct } from '../src/types/sfactory.types';

function inv(stock: number, salePrice: number | null = null) {
  return inventarioDesdeStockRow({
    item_code: 'x',
    stock,
    sale_price: salePrice ?? undefined,
  });
}

test('resolverCodigosPermitidosDeposito: solo códigos vendibles en depósito', () => {
  const productos = [
    {
      Codigo: 'L-WW-TEST1',
      Descripcion: 'Test Hombre NEGRO S',
      rubro_id: 3285,
      Activo: true,
    },
    {
      Codigo: 'L-WW-TEST2',
      Descripcion: 'Test Hombre NEGRO M',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const inventario = new Map([
    ['L-WW-TEST1', inv(0, null)],
    ['L-WW-TEST2', inv(5, null)],
  ]);

  const { codigosPermitidos, clavesGrupoConStock, gruposSinStock } =
    resolverCodigosPermitidosDeposito(grupos, inventario);

  assert.equal(gruposSinStock, 0);
  assert.equal(clavesGrupoConStock.size, 1);
  assert.equal(codigosPermitidos.has('L-WW-TEST1'), false);
  assert.ok(codigosPermitidos.has('L-WW-TEST2'));
});

test('resolverCodigosPermitidosDeposito: precio en depósito sin stock', () => {
  const productos = [
    {
      Codigo: 'L-WW-PRICE1',
      Descripcion: 'Solo precio',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const inventario = new Map([['L-WW-PRICE1', inv(0, 1999)]]);

  const { codigosPermitidos, gruposSinStock } = resolverCodigosPermitidosDeposito(
    grupos,
    inventario
  );

  assert.equal(gruposSinStock, 0);
  assert.ok(codigosPermitidos.has('L-WW-PRICE1'));
});

test('resolverCodigosPermitidosDeposito: marcador _D sin precio no entra', () => {
  const productos = [
    {
      Codigo: 'L-WW-MARC_D',
      Descripcion: 'Marcador dama',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const inventario = new Map([['L-WW-MARC_D', inv(10, null)]]);

  const { codigosPermitidos, gruposSinStock } = resolverCodigosPermitidosDeposito(
    grupos,
    inventario
  );

  assert.equal(gruposSinStock, 1);
  assert.equal(codigosPermitidos.size, 0);
});

test('resolverCodigosPermitidosDeposito: omite grupo sin vendibles', () => {
  const productos = [
    {
      Codigo: 'L-WW-EMPTY1',
      Descripcion: 'Vacío Hombre NEGRO S',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const inventario = new Map([['L-WW-EMPTY1', inv(0, null)]]);

  const { codigosPermitidos, gruposSinStock } = resolverCodigosPermitidosDeposito(
    grupos,
    inventario
  );

  assert.equal(gruposSinStock, 1);
  assert.equal(codigosPermitidos.size, 0);
});

test('resolverGruposConStock (legacy): arrastra todo el grupo si una variante tiene stock', () => {
  const productos = [
    {
      Codigo: 'L-WW-TEST1',
      Descripcion: 'Test Hombre NEGRO S',
      rubro_id: 3285,
      Activo: true,
    },
    {
      Codigo: 'L-WW-TEST2',
      Descripcion: 'Test Hombre NEGRO M',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const stockPorCodigo = new Map<string, number>([
    ['L-WW-TEST1', 0],
    ['L-WW-TEST2', 5],
  ]);

  const { codigosPermitidos } = resolverGruposConStock(grupos, stockPorCodigo);

  assert.ok(codigosPermitidos.has('L-WW-TEST1'));
  assert.ok(codigosPermitidos.has('L-WW-TEST2'));
});
