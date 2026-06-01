import assert from 'node:assert/strict';
import test from 'node:test';
import { agruparProductosPorCodigoBase } from '../src/services/producto-agrupacion.service';
import { resolverGruposConStock } from '../src/utils/sfactory-stock-fetch.utils';
import type { SFactoryProduct } from '../src/types/sfactory.types';

test('resolverGruposConStock: incluye todas las variantes si una tiene stock', () => {
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

  const { codigosPermitidos, clavesGrupoConStock, gruposSinStock } = resolverGruposConStock(
    grupos,
    stockPorCodigo
  );

  assert.equal(gruposSinStock, 0);
  assert.equal(clavesGrupoConStock.size, 1);
  assert.ok(codigosPermitidos.has('L-WW-TEST1'));
  assert.ok(codigosPermitidos.has('L-WW-TEST2'));
});

test('resolverGruposConStock: omite grupo si ninguna variante tiene stock', () => {
  const productos = [
    {
      Codigo: 'L-WW-EMPTY1',
      Descripcion: 'Vacío Hombre NEGRO S',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  const stockPorCodigo = new Map<string, number>([['L-WW-EMPTY1', 0]]);

  const { codigosPermitidos, gruposSinStock } = resolverGruposConStock(grupos, stockPorCodigo);

  assert.equal(gruposSinStock, 1);
  assert.equal(codigosPermitidos.size, 0);
});
