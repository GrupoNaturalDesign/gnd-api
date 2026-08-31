import assert from 'node:assert/strict';
import test from 'node:test';
import { activoSfactoryConWhitelist } from '../src/config/colores-padre-whitelist.utils';
import {
  dedupeBloqueadasWhitelist,
  esBloqueoPorWhitelist,
  motivoInactivoVariante,
  registrarBloqueoWhitelist,
} from '../src/utils/variante-whitelist-report.utils';

test('activoSfactoryConWhitelist: sin color y sin whitelist sigue activo si depósito OK (Jean Flow)', () => {
  assert.equal(activoSfactoryConWhitelist('L-WW-PAN-JFL_H', null, true), true);
  assert.equal(activoSfactoryConWhitelist('L-WW-PAN-JFL_D', '', true), true);
  assert.equal(activoSfactoryConWhitelist('L-WW-PAN-JFL_H', null, false), false);
});

test('activoSfactoryConWhitelist: sin color con whitelist no activa', () => {
  assert.equal(activoSfactoryConWhitelist('L-WW-CAM-WR_H', null, true), false);
  assert.equal(activoSfactoryConWhitelist('L-WW-CAM-WR_H', 'AZUL MARINO', true), true);
});

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
