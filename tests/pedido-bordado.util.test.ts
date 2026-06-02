import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  appendBordadoObservaciones,
  buildBordadoObservacionesResumen,
} from '../src/utils/pedido-bordado.util';

describe('pedido-bordado.util', () => {
  it('buildBordadoObservacionesResumen lista ítems bordados', () => {
    const resumen = buildBordadoObservacionesResumen([
      { nombre: 'Remera', cantidad: 2, bordado: true },
      { nombre: 'Pantalón', cantidad: 1, bordado: false },
    ]);
    assert.strictEqual(resumen, 'Bordado solicitado: Remera ×2');
  });

  it('appendBordadoObservaciones concatena con observaciones existentes', () => {
    const out = appendBordadoObservaciones('Nota del cliente', [
      { nombre: 'Remera', cantidad: 1, bordado: true },
    ]);
    assert.strictEqual(out, 'Nota del cliente\nBordado solicitado: Remera');
  });

  it('appendBordadoObservaciones sin bordado devuelve observaciones base', () => {
    const out = appendBordadoObservaciones('Solo notas', [
      { nombre: 'Remera', cantidad: 1, bordado: false },
    ]);
    assert.strictEqual(out, 'Solo notas');
  });
});
