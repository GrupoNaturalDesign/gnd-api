import assert from 'node:assert/strict';
import test from 'node:test';
import {
  codigoAgrupacionPadreBase,
  esPadreSublineaSfactory,
} from '../src/utils/padre-colores-sync.utils';

test('esPadreSublineaSfactory: Denim y Gabardina', () => {
  assert.equal(esPadreSublineaSfactory('L-WW-ACC-DEL-DENIM_U'), true);
  assert.equal(esPadreSublineaSfactory('L-WW-ACC-DEL_U'), false);
});

test('codigoAgrupacionPadreBase: DEL-DENIM → DEL', () => {
  assert.equal(
    codigoAgrupacionPadreBase('L-WW-ACC-DEL-DENIM_U'),
    'L-WW-ACC-DEL_U'
  );
});
