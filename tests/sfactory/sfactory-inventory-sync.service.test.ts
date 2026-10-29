import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import prisma from '../../src/lib/prisma';
import { sfactoryService } from '../../src/services/sfactory/sfactory.service';
import { SfactoryInventorySyncService } from '../../src/services/sync/sfactory-inventory-sync.service';

function mockPersistence(
  t: TestContext,
  state: { cursorAt: Date | null; initializedAt: Date | null },
  lockAcquired = true
) {
  const syncState = prisma.sfactoryInventorySyncState as any;
  const inventoryItem = prisma.sfactoryInventoryItem as any;
  const rubro = prisma.rubro as any;
  const originals = {
    upsertState: syncState.upsert,
    updateManyState: syncState.updateMany,
    updateState: syncState.update,
    upsertItem: inventoryItem.upsert,
    updateManyItem: inventoryItem.updateMany,
    findRubros: rubro.findMany,
  };
  const upsertState = t.mock.fn(async (_args?: any) => ({
    id: 1,
    empresaId: 1,
    warehouseId: 52624,
    cursorAt: state.cursorAt,
    initializedAt: state.initializedAt,
    lastSuccessAt: null,
    lastError: null,
    lockToken: null,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const updateManyState = t.mock.fn(async (_args?: any) => ({
    count: lockAcquired ? 1 : 0,
  }));
  const updateState = t.mock.fn(async (_args?: any) => ({}));
  const upsertItem = t.mock.fn(async (_args?: any) => ({}));
  const updateManyItem = t.mock.fn(async (_args?: any) => ({ count: 0 }));
  const findRubros = t.mock.fn(async (_args?: any) => []);
  syncState.upsert = upsertState;
  syncState.updateMany = updateManyState;
  syncState.update = updateState;
  inventoryItem.upsert = upsertItem;
  inventoryItem.updateMany = updateManyItem;
  rubro.findMany = findRubros;
  t.after(() => {
    syncState.upsert = originals.upsertState;
    syncState.updateMany = originals.updateManyState;
    syncState.update = originals.updateState;
    inventoryItem.upsert = originals.upsertItem;
    inventoryItem.updateMany = originals.updateManyItem;
    rubro.findMany = originals.findRubros;
  });
  return { upsertState, updateManyState, updateState, upsertItem, updateManyItem };
}

test('servicio: primera ejecución hace exactamente una llamada all_items y guarda cursor', async (t) => {
  const db = mockPersistence(t, { cursorAt: null, initializedAt: null });
  const remote = t.mock.method(
    sfactoryService,
    'inventoryStockItemsChangedSince',
    async () => ({ data: [{ item_code: 'SKU-1', stock: 3, sale_price: 100, warehouse_id: 52624 }] })
  );

  const result = await new SfactoryInventorySyncService().sync(1, 52624);

  assert.equal(remote.mock.callCount(), 1);
  assert.deepEqual(remote.mock.calls[0]!.arguments[0], {
    warehouse_id: 52624,
    all_items: true,
  });
  assert.equal(result.mode, 'initial');
  assert.equal(result.rowsReceived, 1);
  assert.equal(result.llamadasApi, 1);
  assert.equal(db.upsertItem.mock.callCount(), 1);
  assert.equal(db.updateState.mock.callCount(), 1);
  assert.ok(db.updateState.mock.calls[0]!.arguments[0].data.cursorAt instanceof Date);
});

test('servicio: ejecución posterior hace un solo changed_since y delta vacío es válido', async (t) => {
  const cursor = new Date('2026-10-28T18:02:00.000Z');
  mockPersistence(t, { cursorAt: cursor, initializedAt: cursor });
  const remote = t.mock.method(
    sfactoryService,
    'inventoryStockItemsChangedSince',
    async () => ({ data: [] })
  );

  const result = await new SfactoryInventorySyncService().sync(1, 52624);

  assert.equal(remote.mock.callCount(), 1);
  assert.deepEqual(remote.mock.calls[0]!.arguments[0], {
    warehouse_id: 52624,
    changed_since: '2026-10-28 15:00:00',
  });
  assert.equal(result.mode, 'incremental');
  assert.equal(result.rowsReceived, 0);
  assert.equal(result.skippedDueToLock, false);
});

test('servicio: un lease ocupado evita por completo la llamada externa', async (t) => {
  mockPersistence(t, { cursorAt: new Date(), initializedAt: new Date() }, false);
  const remote = t.mock.method(
    sfactoryService,
    'inventoryStockItemsChangedSince',
    async () => ({ data: [] })
  );

  const result = await new SfactoryInventorySyncService().sync(1, 52624);

  assert.equal(remote.mock.callCount(), 0);
  assert.equal(result.skippedDueToLock, true);
  assert.equal(result.llamadasApi, 0);
});

test('servicio: un fallo externo no avanza el cursor', async (t) => {
  const db = mockPersistence(t, {
    cursorAt: new Date('2026-10-28T18:02:00.000Z'),
    initializedAt: new Date(),
  });
  t.mock.method(
    sfactoryService,
    'inventoryStockItemsChangedSince',
    async () => { throw new Error('S-Factory caído'); }
  );

  await assert.rejects(
    () => new SfactoryInventorySyncService().sync(1, 52624),
    /S-Factory caído/
  );
  assert.equal(db.updateState.mock.callCount(), 0, 'no debe ejecutar update(cursorAt)');
  assert.ok(
    db.updateManyState.mock.calls.some((call: { arguments: any[] }) =>
      String(call.arguments[0]?.data?.lastError ?? '').includes('S-Factory caído')
    )
  );
});

test('servicio: snapshot inicial vacío no borra inventario ni avanza cursor', async (t) => {
  const db = mockPersistence(t, { cursorAt: null, initializedAt: null });
  t.mock.method(
    sfactoryService,
    'inventoryStockItemsChangedSince',
    async () => ({ data: [] })
  );

  await assert.rejects(
    () => new SfactoryInventorySyncService().sync(1, 52624),
    /snapshot inicial vacío/
  );
  assert.equal(db.upsertItem.mock.callCount(), 0);
  assert.equal(db.updateManyItem.mock.callCount(), 0);
  assert.equal(db.updateState.mock.callCount(), 0);
});
