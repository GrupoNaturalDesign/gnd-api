import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aplicarSublineaACodigoAgrupacion,
  detectarSufijoSublineaAgrupacion,
  enriquecerNombreBaseSublinea,
} from '../src/utils/sfactory-sublinea-agrupacion.utils';
import { agruparProductosPorCodigoBase } from '../src/services/producto-agrupacion.service';
import type { SFactoryProduct } from '../src/types/sfactory.types';

test('detectarSufijoSublineaAgrupacion: Denim y Gabardina', () => {
  assert.equal(
    detectarSufijoSublineaAgrupacion('Delantal Chill Denim Unisex Jean Azul'),
    '-DENIM'
  );
  assert.equal(
    detectarSufijoSublineaAgrupacion('Delantal Chill Gabardina Unisex'),
    '-GABARDINA'
  );
  assert.equal(
    detectarSufijoSublineaAgrupacion('Delantal Chill Unisex Gris Cemento'),
    null
  );
});

test('aplicarSublineaACodigoAgrupacion: inserta antes de _U', () => {
  assert.equal(
    aplicarSublineaACodigoAgrupacion('L-WW-ACC-DEL_U', '-DENIM'),
    'L-WW-ACC-DEL-DENIM_U'
  );
});

test('enriquecerNombreBaseSublinea: agrega Denim al nombre padre', () => {
  assert.equal(
    enriquecerNombreBaseSublinea('Delantal Chill', 'Delantal Chill Denim Unisex Jean Azul'),
    'Delantal Chill Denim'
  );
  assert.equal(
    enriquecerNombreBaseSublinea('Delantal Chill Denim', 'Delantal Chill Denim Jean Negro'),
    'Delantal Chill Denim'
  );
});

test('agruparProductosPorCodigoBase: Delantal Chill separa Denim de línea base', () => {
  const productos = [
    {
      Codigo: 'L-WW-ACC-DEL_U',
      Descripcion: 'Delantal Chill Unisex Negro',
      Activo: true,
    },
    {
      Codigo: 'L-WW-ACC-DEL2',
      Descripcion: 'Delantal Chill Unisex Gris Cemento',
      Activo: true,
    },
    {
      Codigo: 'L-WW-ACC-DEL3',
      Descripcion: 'Delantal Chill Denim Unisex Jean Azul',
      Activo: true,
    },
    {
      Codigo: 'L-WW-ACC-DEL4',
      Descripcion: 'Delantal Chill Denim Unisex Jean Negro',
      Activo: true,
    },
  ] as SFactoryProduct[];

  const grupos = agruparProductosPorCodigoBase(productos);
  assert.equal(grupos.size, 2);

  const chill = grupos.get('L-WW-ACC-DEL_U');
  const denim = grupos.get('L-WW-ACC-DEL-DENIM_U');
  assert.ok(chill);
  assert.ok(denim);
  assert.equal(chill.productos.length, 2);
  assert.equal(denim.productos.length, 2);
  assert.ok(denim.nombreBase.toLowerCase().includes('denim'));
  assert.equal(
    chill.productos.map((p) => (p.producto as { Codigo?: string }).Codigo).sort().join(','),
    'L-WW-ACC-DEL2,L-WW-ACC-DEL_U'
  );
});
