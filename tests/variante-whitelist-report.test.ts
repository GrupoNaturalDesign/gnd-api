import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeBloqueadasWhitelist,
  esBloqueoPorWhitelist,
  motivoInactivoVariante,
  registrarBloqueoWhitelist,
} from '../src/utils/variante-whitelist-report.utils';

test('motivoInactivoVariante: AZUL pendiente en WR_H (solo AZUL MARINO)', () => {
  assert.equal(
    motivoInactivoVariante('L-WW-CAM-WR_H', 'AZUL', false, 10),
    'pendiente_aprobacion'
  );
});

test('motivoInactivoVariante: AZUL permitido tras aprobación admin', () => {
  assert.equal(
    motivoInactivoVariante('L-WW-CAM-WR_H', 'AZUL', false, 10, new Set(['AZUL'])),
    'sin_stock_deposito'
  );
});

test('motivoInactivoVariante: activa', () => {
  assert.equal(
    motivoInactivoVariante('L-WW-PAN-CBO_H', 'AZUL MARINO', true, 5),
    'activa'
  );
});

test('esBloqueoPorWhitelist: stock depósito + color no permitido', () => {
  assert.equal(esBloqueoPorWhitelist('L-WW-CAM-WR_H', 'AZUL', true), true);
});

test('esBloqueoPorWhitelist: no bloquea si color aprobado en BD', () => {
  assert.equal(
    esBloqueoPorWhitelist('L-WW-CAM-WR_H', 'AZUL', true, new Set(['AZUL'])),
    false
  );
});

test('registrarBloqueoWhitelist dedupe y cap', () => {
  const acc: Parameters<typeof registrarBloqueoWhitelist>[0] = [];
  const seen = new Set<string>();
  const row = {
    codigoAgrupacion: 'L-WW-PAN-CBO_H',
    sfactoryCodigo: 'L-WW-PAN-CBO35',
    color: 'NEGRO',
    stock: 8,
  };
  registrarBloqueoWhitelist(acc, seen, row);
  registrarBloqueoWhitelist(acc, seen, row);
  assert.equal(acc.length, 1);
  const merged = dedupeBloqueadasWhitelist([acc, acc]);
  assert.equal(merged.count, 1);
});
