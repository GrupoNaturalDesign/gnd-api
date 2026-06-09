import assert from 'node:assert/strict';
import test from 'node:test';
import { colorPermitidoEnPadre } from '../src/config/colores-padre-whitelist.utils';
import {
  colorDesdePatronesDescripcion,
  consolidarColoresCanonico,
  resolverColorDesdeSfactory,
} from '../src/utils/sfactory-color-parse.utils';

test('colorDesdePatronesDescripcion: GRIS MEL CL → CLARO (no CELESTE)', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm D GRIS MEL CL M'),
    'GRIS MELANGE CLARO'
  );
});

test('colorDesdePatronesDescripcion: melange claro y oscuro', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm Dama Gris melange Claro'),
    'GRIS MELANGE CLARO'
  );
  assert.equal(
    colorDesdePatronesDescripcion('Sweater Essence Hombre Gris melange oscuro'),
    'GRIS MELANGE OSCURO'
  );
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm D GRIS MEL OS L'),
    'GRIS MELANGE OSCURO'
  );
});

test('colorDesdePatronesDescripcion: RAY CEL y RAY COMBINADA', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Camisa Joyfull Dama RAY CEL M'),
    'CELESTE'
  );
  assert.equal(
    colorDesdePatronesDescripcion('Camisa Manage H RAY COMBINADA 42'),
    'RAYA COMBINADA'
  );
  assert.equal(
    colorDesdePatronesDescripcion('Camisa Manage H RAY AZUL 40'),
    'RAYA AZUL'
  );
});

test('whitelist: Manage hombre permite raya combinada y raya azul', () => {
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_H', 'RAYA COMBINADA'), true);
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_H', 'RAYA AZUL'), true);
  // Legacy NTDS: alias → RAYA COMBINADA / RAYA AZUL
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_H', 'RAYAS 1: COMBINADAS'), true);
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_H', 'RAYAS 2: FINA AZUL'), true);
});

test('colorDesdePatronesDescripcion: AZUL MAR y NEG', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm D AZUL MAR L'),
    'AZUL MARINO'
  );
  assert.equal(colorDesdePatronesDescripcion('Sweater Essence H NEG M'), 'NEGRO');
});

test('whitelist: tejidos permiten melange claro y oscuro', () => {
  assert.equal(
    colorPermitidoEnPadre('L-OF-TEJ-CAR-CHA_D', 'GRIS MELANGE CLARO'),
    true
  );
  assert.equal(
    colorPermitidoEnPadre('L-OF-TEJ-CAR-CHA_D', 'GRIS MELANGE OSCURO'),
    true
  );
  assert.equal(colorPermitidoEnPadre('L-OF-TEJ-CAR-CHA_D', 'GRIS PERLA'), false);
});

test('whitelist: Joyfull solo celeste; blanco no permitido', () => {
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-JOY_D', 'CELESTE'), true);
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-JOY_D', 'BLANCO'), false);
});

test('whitelist: Manage dama sin azul marino', () => {
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_D', 'CELESTE'), true);
  assert.equal(colorPermitidoEnPadre('L-OF-CAM-MAN_D', 'AZUL MARINO'), false);
});

test('resolverColorDesdeSfactory: AZUL MAR en descripción → AZUL MARINO', () => {
  assert.equal(
    resolverColorDesdeSfactory('Cargo Balance Hombre AZUL MAR 42', 'AZUL', null, 'X'),
    'AZUL MARINO'
  );
});

test('consolidarColoresCanonico: quita AZUL si hay AZUL MARINO', () => {
  assert.deepEqual(
    consolidarColoresCanonico(['AZUL', 'AZUL MARINO', 'NEGRO']),
    ['AZUL MARINO', 'NEGRO']
  );
});
