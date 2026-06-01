import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsearNombreProducto,
  normalizarSexo,
  agruparProductosPorCodigoBase,
  resolverClaveAgrupacion,
} from '../src/services/producto-agrupacion.service';
import type { SFactoryProduct } from '../src/types/sfactory.types';
import {
  canonizarColor,
  canonizarTalle,
  generoFiltroAValorBd,
} from '../src/constants/variantes-filtros';
import { inferirColorDesdeSku } from '../src/utils/sku-line-fusion.utils';
import { limpiarSufijoGeneroSuelto } from '../src/utils/variantes-parse.utils';

test('parsearNombreProducto: Chomba Hombre NEGRO L', () => {
  const r = parsearNombreProducto('Chomba Flowing Hombre NEGRO L');
  assert.equal(r.sexo, 'Masculino');
  assert.equal(r.color, 'NEGRO');
  assert.equal(r.talle, 'L');
  assert.ok(r.nombreBase.includes('Chomba'));
});

test('parsearNombreProducto: DAMA GRIS MELANGE M', () => {
  const r = parsearNombreProducto('Remera Gentle DAMA GRIS MELANGE M');
  assert.equal(r.sexo, 'Femenino');
  assert.equal(r.color, 'GRIS MELANGE');
  assert.equal(r.talle, 'M');
});

test('parsearNombreProducto: color compuesto RAYAS sin confundir AZUL', () => {
  const r = parsearNombreProducto('Pantalon Hombre RAYAS 2: FINA AZUL XL');
  assert.equal(r.color, 'RAYAS 2: FINA AZUL');
  assert.equal(r.talle, 'XL');
  assert.equal(r.sexo, 'Masculino');
});

test('parsearNombreProducto: talle numérico 42', () => {
  const r = parsearNombreProducto('Camisa Wrench Hombre Cemento 42');
  assert.equal(r.talle, '42');
  assert.equal(r.color, 'CEMENTO');
});

test('parsearNombreProducto: 2XS', () => {
  const r = parsearNombreProducto('Buzo Unisex NEGRO 2XS');
  assert.equal(r.talle, '2XS');
  assert.equal(r.color, 'NEGRO');
});

test('parsearNombreProducto: UNISEX final sin talle duplicado', () => {
  const r = parsearNombreProducto('Remera Basic Unisex');
  assert.equal(r.sexo, 'Unisex');
  assert.equal(r.talle, null);
});

test('parsearNombreProducto: Camisa Wrench 58 Hombre AZUL MARINO 40', () => {
  const r = parsearNombreProducto('Camisa Wrench 58 Hombre AZUL MARINO 40');
  assert.equal(r.sexo, 'Masculino');
  assert.equal(r.color, 'AZUL MARINO');
  assert.equal(r.talle, '40');
  assert.ok(r.nombreBase.includes('Wrench'));
  assert.ok(r.nombreBase.includes('58'));
});

test('parsearNombreProducto: Camisa Wrench 58 Hombre AZUL MARINO sin talle', () => {
  const r = parsearNombreProducto('Camisa Wrench 58 Hombre AZUL MARINO');
  assert.equal(r.sexo, 'Masculino');
  assert.equal(r.color, 'AZUL MARINO');
  assert.equal(r.talle, null);
});

test('resolverClaveAgrupacion: SKU L-WW-CAM-WR_H no duplica sufijo', () => {
  const { claveGrupo } = resolverClaveAgrupacion('L-WW-CAM-WR_H', 'Masculino');
  assert.equal(claveGrupo, 'L-WW-CAM-WR_H');
});

test('agruparProductosPorCodigoBase: WR_H no genera WR_H_H', () => {
  const productos = [
    {
      Codigo: 'L-WW-CAM-WR_H',
      Descripcion: 'Camisa Wrench Hombre Cemento 32',
      rubro_id: 3285,
      Activo: true,
    },
  ] as SFactoryProduct[];
  const grupos = agruparProductosPorCodigoBase(productos);
  assert.ok(grupos.has('L-WW-CAM-WR_H'));
  assert.equal(grupos.has('L-WW-CAM-WR_H_H'), false);
});

test('canonizarColor y generoFiltroAValorBd', () => {
  assert.equal(canonizarColor('gris melange'), 'GRIS MELANGE');
  assert.equal(canonizarColor('Black'), 'NEGRO');
  assert.equal(canonizarColor('BLACK'), 'NEGRO');
  assert.equal(canonizarColor('D'), null);
  assert.equal(generoFiltroAValorBd('dama'), 'Femenino');
  assert.equal(generoFiltroAValorBd('HOMBRE'), 'Masculino');
  assert.equal(normalizarSexo('DAMA'), 'Femenino');
});

test('parsearNombreProducto: Black en nombre → NEGRO', () => {
  const r = parsearNombreProducto('Pantalón Jean Workfit Black Hombre 42');
  assert.equal(r.color, 'NEGRO');
  assert.equal(r.talle, '42');
});

test('resolverClaveAgrupacion: L-OF-PAN-JWB_D no duplica sufijo', () => {
  const { claveGrupo } = resolverClaveAgrupacion('L-OF-PAN-JWB_D', 'Femenino');
  assert.equal(claveGrupo, 'L-OF-PAN-JWB_D');
  assert.equal(resolverClaveAgrupacion('L-OF-PAN-JWB_D_D', 'Femenino').claveGrupo, 'L-OF-PAN-JWB_D');
});

test('inferirColorDesdeSku: JWB → NEGRO', () => {
  assert.equal(inferirColorDesdeSku('L-OF-PAN-JWB1'), 'NEGRO');
  assert.equal(inferirColorDesdeSku('L-OF-PAN-JWB_D'), 'NEGRO');
});

test('agruparProductosPorCodigoBase: JWB con color NEGRO desde SKU', () => {
  const productos = [
    {
      Codigo: 'L-OF-PAN-JWB1',
      Descripcion: 'Pantalón Jean Workfit Black',
      Activo: true,
    },
  ] as SFactoryProduct[];
  const grupos = agruparProductosPorCodigoBase(productos);
  const g = grupos.get('L-OF-PAN-JWB_U');
  assert.ok(g);
  assert.equal(g.productos[0]?.color, 'NEGRO');
});

test('agruparProductosPorCodigoBase: PALN y PALC fusionan con colores NEGRO y CAMEL', () => {
  const productos = [
    {
      Codigo: 'L-OF-SAS-SA-PALN1',
      Descripcion: 'Palazo Sastrero DAMA',
      rubro_id: 3314,
      Activo: true,
    },
    {
      Codigo: 'L-OF-SAS-SA-PALC2',
      Descripcion: 'Palazo Sastrero Camel DAMA',
      rubro_id: 3314,
      Activo: true,
    },
  ] as SFactoryProduct[];
  const grupos = agruparProductosPorCodigoBase(productos);
  assert.equal(grupos.size, 1);
  const g = grupos.get('L-OF-SAS-SA-PAL_D');
  assert.ok(g);
  assert.equal(g.nombreBase, 'Palazo Sastrero');
  assert.deepEqual([...g.colores].sort(), ['CAMEL', 'NEGRO']);
  assert.equal(g.productos.length, 2);
  assert.equal(g.productos[0]?.color, 'NEGRO');
  assert.equal(g.productos[1]?.color, 'CAMEL');
});

test('parsearNombreProducto: MEL y CL abreviados', () => {
  const r = parsearNombreProducto('Sweater Essence Hombre MEL CL');
  assert.equal(r.sexo, 'Masculino');
  assert.ok(r.color === 'MELANGE' || r.color === 'CELESTE');
});

test('limpiarSufijoGeneroSuelto: quita D suelto si género es masculino', () => {
  assert.equal(
    limpiarSufijoGeneroSuelto('Palazo Sastrero Status D', 'Masculino'),
    'Palazo Sastrero Status'
  );
});

test('parsearNombreProducto: Cardigan Charm MEL OS', () => {
  const r = parsearNombreProducto('Cardigan Charm MEL OS');
  assert.equal(r.color, 'MELANGE');
  assert.equal(r.talle, 'OS');
});

test('canonizarColor: MEL y CL', () => {
  assert.equal(canonizarColor('MEL'), 'MELANGE');
  assert.equal(canonizarColor('CL'), 'CELESTE');
});

test('canonizarTalle: OS', () => {
  assert.equal(canonizarTalle('OS'), 'OS');
});

test('agruparProductosPorCodigoBase: PST no fusiona con PAL', () => {
  const productos = [
    {
      Codigo: 'L-OF-SAS-SA-PALN1',
      Descripcion: 'Palazo Sastrero DAMA',
      Activo: true,
    },
    {
      Codigo: 'L-OF-SAS-PST01',
      Descripcion: 'Palazo Sastrero Status DAMA',
      Activo: true,
    },
  ] as SFactoryProduct[];
  const grupos = agruparProductosPorCodigoBase(productos);
  assert.equal(grupos.size, 2);
  assert.ok(grupos.has('L-OF-SAS-SA-PAL_D'));
  assert.ok(grupos.has('L-OF-SAS-PST_D'));
});
