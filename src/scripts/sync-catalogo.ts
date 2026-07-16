/**
 * Sync rubros + subrubros (+ opcional productos/stock) sin HTTP.
 * Compila a dist/scripts/sync-catalogo.js (deploy Hostinger).
 *
 * Uso local (desde api/):
 *   npx ts-node --transpile-only src/scripts/sync-catalogo.ts [empresaId] [--rubros-only] [--force]
 *
 * En servidor (tras deploy):
 *   node dist/scripts/sync-catalogo.js 1 --rubros-only
 */
import prisma from '../lib/prisma';
import { rubroSyncService } from '../services/sync/rubro-sync.service';
import { productoSyncService } from '../services/sync/producto-sync.service';
import { stockPreciosSyncService } from '../services/sync/stock-precios-sync.service';

async function main() {
  const argv = process.argv.slice(2);
  const rubrosOnly = argv.includes('--rubros-only');
  const forceReprocess = argv.includes('--force');
  const empresaId = parseInt(argv.find((a) => /^\d+$/.test(a)) || '1', 10);

  console.log(
    `Sync catálogo empresaId=${empresaId}${rubrosOnly ? ' (solo rubros/subrubros)' : ''}${forceReprocess ? ' forceReprocess=true' : ''} …`
  );
  const t0 = Date.now();

  const rubros = await rubroSyncService.syncRubros(empresaId);
  console.log('Rubros:', rubros);

  const subrubros = await rubroSyncService.syncSubrubros(empresaId);
  console.log('Subrubros:', subrubros);

  if (!rubrosOnly) {
    const productos = await productoSyncService.syncProductos(empresaId, {
      forceReprocess,
    });
    console.log('Productos resumen:', productos.resumen);

    try {
      const stockPrecios = await stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce(
        empresaId
      );
      console.log('Stock/precios:', stockPrecios);
    } catch (err) {
      console.error('Stock/precios post-sync falló:', err);
    }
  }

  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nListo en ${min} min`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
