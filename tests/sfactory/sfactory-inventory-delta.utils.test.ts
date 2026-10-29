import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInventoryChangedParameters,
  cursorWithOverlap,
  formatSfactoryChangedSince,
  normalizeInventoryChangedRows,
} from '../../src/utils/sfactory-inventory-delta.utils';

test('carga inicial usa all_items en una sola consulta lógica', () => {
  assert.deepEqual(buildInventoryChangedParameters({ warehouseId: 52624 }), {
    mode: 'initial',
    parameters: { warehouse_id: 52624, all_items: true },
  });
});

test('delta usa cursor con dos minutos de solapamiento', () => {
  const cursor = new Date('2026-10-28T18:02:00.000Z'); // 15:02 Argentina
  assert.equal(cursorWithOverlap(cursor).toISOString(), '2026-10-28T18:00:00.000Z');
  assert.deepEqual(buildInventoryChangedParameters({ warehouseId: 52624, cursorAt: cursor }), {
    mode: 'incremental',
    parameters: { warehouse_id: 52624, changed_since: '2026-10-28 15:00:00' },
  });
});

test('fecha changed_since se serializa en zona horaria Argentina', () => {
  assert.equal(
    formatSfactoryChangedSince(new Date('2026-07-01T15:30:45.000Z')),
    '2026-07-01 12:30:45'
  );
});

test('normalización deduplica, ignora otro depósito y conserva cero explícito', () => {
  const rows = normalizeInventoryChangedRows([
    { item_code: ' SKU-1 ', stock: 2, sale_price: 100, warehouse_id: 52624 },
    { item_code: 'SKU-OTRO', stock: 9, warehouse_id: 7 },
    { item_code: 'SKU-1', stock: 0, sale_price: 0, warehouse_id: 52624 },
    { item_code: '', stock: 1 },
  ], 52624);
  assert.deepEqual(rows, [{
    itemCode: 'SKU-1',
    warehouseId: 52624,
    stock: 0,
    salePrice: null,
    sourceUpdatedAt: null,
  }]);
});
