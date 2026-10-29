import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStockSyncMessage } from '../../src/utils/stock-sync-response.util';

test('UX: delta vacío comunica stock al día y no un error', () => {
  const message = buildStockSyncMessage({
    mode: 'incremental', warehouseId: 52624, rowsReceived: 0,
    variantesActualizadas: 0, variantesOmitidas: 0, llamadasApi: 1,
  });
  assert.match(message, /Stock al día/);
  assert.doesNotMatch(message, /error|no devolvió/i);
});

test('UX: carga inicial informa filas y una llamada', () => {
  const message = buildStockSyncMessage({
    mode: 'initial', warehouseId: 52624, rowsReceived: 2700,
    variantesActualizadas: 2500, variantesOmitidas: 200, llamadasApi: 1,
  });
  assert.match(message, /2700 ítems/);
  assert.match(message, /1 llamada API/);
});

test('UX: lease ocupado explica que no hubo consulta duplicada', () => {
  const message = buildStockSyncMessage({
    mode: 'incremental', warehouseId: 52624, rowsReceived: 0,
    variantesActualizadas: 0, variantesOmitidas: 0, llamadasApi: 0,
    skippedDueToLock: true,
  });
  assert.match(message, /ya estaba en curso/);
});
