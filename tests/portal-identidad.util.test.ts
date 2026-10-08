import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolverIdentidadPortal,
  resolverIdentidadUnica,
} from '../src/utils/portal-identidad.util';

describe('portal-identidad.util', () => {
  it('persona física: extrae DNI de los 8 dígitos centrales del CUIL', () => {
    assert.deepEqual(resolverIdentidadPortal('20347684678'), {
      dni: '34768467',
      cuit: '20347684678',
    });
  });

  it('acepta CUIL con guiones, espacios o como number', () => {
    const esperado = { dni: '34768467', cuit: '27347684678' };
    assert.deepEqual(resolverIdentidadPortal('27-34768467-8'), esperado);
    assert.deepEqual(resolverIdentidadPortal(' 27 34768467 8 '), esperado);
    assert.deepEqual(resolverIdentidadPortal(27347684678), esperado);
  });

  it('cubre prefijos 23 y 24 como persona física', () => {
    assert.equal(resolverIdentidadPortal('23347684679')?.dni, '34768467');
    assert.equal(resolverIdentidadPortal('24347684670')?.dni, '34768467');
  });

  it('DNI de 7 dígitos dentro del CUIL se manda sin cero inicial', () => {
    assert.deepEqual(resolverIdentidadPortal('20061234563'), {
      dni: '6123456',
      cuit: '20061234563',
    });
  });

  it('empresa: solo CUIT, sin DNI', () => {
    assert.deepEqual(resolverIdentidadPortal('30712345678'), { cuit: '30712345678' });
    assert.deepEqual(resolverIdentidadPortal('33-71234567-9'), { cuit: '33712345679' });
    assert.deepEqual(resolverIdentidadPortal('34712345678'), { cuit: '34712345678' });
  });

  it('DNI suelto de 7 u 8 dígitos', () => {
    assert.deepEqual(resolverIdentidadPortal('34768467'), { dni: '34768467' });
    assert.deepEqual(resolverIdentidadPortal('34.768.467'), { dni: '34768467' });
    assert.deepEqual(resolverIdentidadPortal('6123456'), { dni: '6123456' });
  });

  it('devuelve null para datos vacíos o inválidos', () => {
    assert.equal(resolverIdentidadPortal(null), null);
    assert.equal(resolverIdentidadPortal(undefined), null);
    assert.equal(resolverIdentidadPortal(''), null);
    assert.equal(resolverIdentidadPortal('-'), null);
    assert.equal(resolverIdentidadPortal('12345'), null);
    assert.equal(resolverIdentidadPortal('123456789'), null);
    assert.equal(resolverIdentidadPortal('99347684678'), null);
    assert.equal(resolverIdentidadPortal('00000000'), null);
    assert.equal(resolverIdentidadPortal({ cuit: '20347684678' }), null);
  });

  describe('resolverIdentidadUnica', () => {
    it('usa la identidad si todos los candidatos coinciden', () => {
      assert.deepEqual(resolverIdentidadUnica(['20-34768467-8', '20347684678', null]), {
        dni: '34768467',
        cuit: '20347684678',
      });
    });

    it('devuelve null si los candidatos resuelven a identidades distintas', () => {
      assert.equal(resolverIdentidadUnica(['20347684678', '30712345678']), null);
    });

    it('devuelve null sin candidatos válidos', () => {
      assert.equal(resolverIdentidadUnica([]), null);
      assert.equal(resolverIdentidadUnica([null, '', 'abc']), null);
    });
  });
});
