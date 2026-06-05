import assert from 'node:assert/strict';
import test from 'node:test';
import { colorPermitidoEnPadre } from '../src/config/colores-padre-whitelist.utils';
import {
  colorDesdePatronesDescripcion,
  consolidarColoresCanonico,
  resolverColorDesdeSfactory,
} from '../src/utils/sfactory-color-parse.utils';

test('colorDesdePatronesDescripcion: GRIS MEL CL no es CELESTE', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm D GRIS MEL CL M'),
    'GRIS MELANGE'
  );
});

test('colorDesdePatronesDescripcion: RAY CEL y RAY COMBINADA', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Camisa Joyfull Dama RAY CEL M'),
    'CELESTE'
  );
  assert.equal(
    colorDesdePatronesDescripcion('Camisa Manage H RAY COMBINADA 42'),
    'RAYAS 1: COMBINADAS'
  );
});

test('colorDesdePatronesDescripcion: AZUL MAR y NEG', () => {
  assert.equal(
    colorDesdePatronesDescripcion('Cardigan Charm D AZUL MAR L'),
    'AZUL MARINO'
  );
  assert.equal(colorDesdePatronesDescripcion('Sweater Essence H NEG M'), 'NEGRO');
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
