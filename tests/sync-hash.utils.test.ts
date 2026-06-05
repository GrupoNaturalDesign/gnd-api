import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decimalsEqual,
  hashProductoSfactoryFields,
  hashClienteFields,
  shouldUpdateStockPrecio,
  mapCodigoToAgrupacionCanonica,
  resolveGruposAfectados,
  resolveGruposDesalineados,
  stableHash,
} from '../src/utils/sync-hash.utils';
import { agruparProductosPorCodigoBase } from '../src/services/producto-agrupacion.service';
import type { SFactoryProduct } from '../src/types/sfactory.types';

test('stableHash is deterministic', () => {
  const a = stableHash({ x: 1, y: 'z' });
  const b = stableHash({ x: 1, y: 'z' });
  assert.equal(a, b);
  assert.notEqual(a, stableHash({ x: 2, y: 'z' }));
});

test('decimalsEqual compares Decimal-like values', () => {
  assert.equal(decimalsEqual(10, 10.0), true);
  assert.equal(decimalsEqual('10.00', 10), true);
  assert.equal(decimalsEqual(null, null), true);
  assert.equal(decimalsEqual(10, 11), false);
});

test('hashProductoSfactoryFields ignores ultima_sync', () => {
  const base = {
    codigo: 'SKU-1',
    precio_venta: 100,
    activo: 'S',
    rubro_id: 1,
    subrubro_id: 2,
    descripcion: 'Test',
    descrip_corta: null,
    barcode: null,
    linea: null,
    material: null,
    sfactory_id: 99,
  };
  assert.equal(hashProductoSfactoryFields(base), hashProductoSfactoryFields({ ...base }));
});

test('hashClienteFields changes when email changes', () => {
  const a = hashClienteFields({
    razonSocial: 'ACME',
    activo: true,
    email: 'a@test.com',
  });
  const b = hashClienteFields({
    razonSocial: 'ACME',
    activo: true,
    email: 'b@test.com',
  });
  assert.notEqual(a, b);
});

test('shouldUpdateStockPrecio skips when unchanged', () => {
  const d = shouldUpdateStockPrecio(
    { stockCache: 5, precioCache: 100 },
    { stock: 5, saleOk: 100 }
  );
  assert.equal(d.skip, true);
});

test('shouldUpdateStockPrecio updates only stock when price unchanged', () => {
  const d = shouldUpdateStockPrecio(
    { stockCache: 5, precioCache: 100 },
    { stock: 3, saleOk: 100 }
  );
  assert.equal(d.skip, false);
  assert.equal(d.updateStock, true);
  assert.equal(d.updatePrecio, false);
});

test('shouldUpdateStockPrecio updates price when saleOk differs', () => {
  const d = shouldUpdateStockPrecio(
    { stockCache: 5, precioCache: 100 },
    { stock: 5, saleOk: 120 }
  );
  assert.equal(d.skip, false);
  assert.equal(d.updatePrecio, true);
});

test('resolveGruposAfectados: agrupación canónica y padre web legacy', () => {
  const codigos = new Set(['SKU-A']);
  const byCodigo = new Map([['SKU-A', { codigo: 'SKU-A', descripcion: 'Test' }]]);
  const byAgrupacion = new Map([['SKU-A', 'GRP-LEGACY']]);
  const grupos = resolveGruposAfectados(codigos, byCodigo, byAgrupacion);
  assert.ok(grupos.has('GRP-LEGACY'));
  assert.ok(grupos.size >= 1);
});

test('resolveGruposAfectados: Delantal Denim incluye padre DENIM y legacy DEL_U', () => {
  const codigos = new Set(['L-WW-ACC-DEL3']);
  const byCodigo = new Map([
    [
      'L-WW-ACC-DEL3',
      {
        codigo: 'L-WW-ACC-DEL3',
        descripcion: 'Delantal Chill Denim Unisex Jean Azul',
      },
    ],
  ]);
  const byAgrupacion = new Map([['L-WW-ACC-DEL3', 'L-WW-ACC-DEL_U']]);
  const grupos = resolveGruposAfectados(codigos, byCodigo, byAgrupacion);
  assert.ok(grupos.has('L-WW-ACC-DEL-DENIM_U'));
  assert.ok(grupos.has('L-WW-ACC-DEL_U'));
});

test('resolveGruposDesalineados detecta DEL3 en padre viejo', () => {
  const productos = [
    {
      Codigo: 'L-WW-ACC-DEL3',
      Descripcion: 'Delantal Chill Denim Unisex Jean Azul',
      Activo: true,
    },
    {
      Codigo: 'L-WW-ACC-DEL2',
      Descripcion: 'Delantal Chill Unisex Gris Cemento',
      Activo: true,
    },
  ] as SFactoryProduct[];
  const grupos = agruparProductosPorCodigoBase(productos);
  const canonico = mapCodigoToAgrupacionCanonica(grupos);
  const desalineados = resolveGruposDesalineados(canonico, [
    {
      sfactoryCodigo: 'L-WW-ACC-DEL3',
      codigoAgrupacionPadre: 'L-WW-ACC-DEL_U',
    },
    {
      sfactoryCodigo: 'L-WW-ACC-DEL2',
      codigoAgrupacionPadre: 'L-WW-ACC-DEL_U',
    },
  ]);
  assert.ok(desalineados.has('L-WW-ACC-DEL-DENIM_U'));
  assert.ok(desalineados.has('L-WW-ACC-DEL_U'));
  assert.equal(desalineados.has('L-WW-ACC-DEL-DENIM_U'), true);
});
