/**
 * Sync productos con forceReprocess (sin HTTP / sin Firebase).
 * Uso: npx ts-node --transpile-only scripts/sync-productos-force.ts [empresaId]
 */
import prisma from '../src/lib/prisma';
import { productoSyncService } from '../src/services/sync/producto-sync.service';

async function main() {
  const empresaId = parseInt(process.argv[2] || '1', 10);
  console.log(`Sync productos empresaId=${empresaId} forceReprocess=true …`);
  const t0 = Date.now();

  const resultado = await productoSyncService.syncProductos(empresaId, {
    forceReprocess: true,
  });

  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nListo en ${min} min`);
  console.log(JSON.stringify(resultado.resumen, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
