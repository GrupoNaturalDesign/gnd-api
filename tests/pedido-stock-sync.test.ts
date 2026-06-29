import assert from 'node:assert/strict';
import test from 'node:test';
import {
  debeReservarStockLocal,
  isPedidoPostSyncStockEnabled,
} from '../src/services/sync/pedido-stock-sync.util';
import { stockPreciosSyncService } from '../src/services/sync/stock-precios-sync.service';

test('debeReservarStockLocal — admin sin cotización previa', () => {
  assert.equal(
    debeReservarStockLocal({
      esReintentoAprobacionErp: false,
      sfactoryOrdenIdAlInicio: null,
    }),
    true
  );
});

test('debeReservarStockLocal — checkout con cotización SF previa', () => {
  assert.equal(
    debeReservarStockLocal({
      esReintentoAprobacionErp: false,
      sfactoryOrdenIdAlInicio: 42,
    }),
    false
  );
});

test('debeReservarStockLocal — reintento aprobación ERP', () => {
  assert.equal(
    debeReservarStockLocal({
      esReintentoAprobacionErp: true,
      sfactoryOrdenIdAlInicio: 42,
    }),
    false
  );
});

test('isPedidoPostSyncStockEnabled — habilitado por defecto', () => {
  const prev = process.env.PEDIDO_POST_SYNC_STOCK_ENABLED;
  delete process.env.PEDIDO_POST_SYNC_STOCK_ENABLED;
  try {
    assert.equal(isPedidoPostSyncStockEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.PEDIDO_POST_SYNC_STOCK_ENABLED;
    else process.env.PEDIDO_POST_SYNC_STOCK_ENABLED = prev;
  }
});

test('isPedidoPostSyncStockEnabled — deshabilitado con false', () => {
  const prev = process.env.PEDIDO_POST_SYNC_STOCK_ENABLED;
  process.env.PEDIDO_POST_SYNC_STOCK_ENABLED = 'false';
  try {
    assert.equal(isPedidoPostSyncStockEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.PEDIDO_POST_SYNC_STOCK_ENABLED;
    else process.env.PEDIDO_POST_SYNC_STOCK_ENABLED = prev;
  }
});

test('syncStockPreciosPorCodigos — sin códigos no consulta SF', async () => {
  const result = await stockPreciosSyncService.syncStockPreciosPorCodigos(1, [], 99);
  assert.equal(result.warehouseId, 99);
  assert.equal(result.codigosConsultados, 0);
  assert.equal(result.variantesActualizadas, 0);
  assert.equal(result.llamadasApi, 0);
  assert.deepEqual(result.codigosOmitidos, []);
});
