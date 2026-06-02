/**
 * Elimina productos_web duplicados (mismo producto_padre_id + sfactory_id).
 *
 * Uso:
 *   npx ts-node --transpile-only scripts/cleanup-variantes-duplicadas.ts [empresaId]
 *   npx ts-node --transpile-only scripts/cleanup-variantes-duplicadas.ts 1 --apply
 */
import prisma from '../src/lib/prisma';
import { splitKeeperAndLosers } from '../src/utils/variante-dedup.utils';
import { CacheService } from '../src/services/cache.service';

async function main() {
  const args = process.argv.slice(2);
  const empresaId = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '1', 10);
  const apply = args.includes('--apply');

  console.log(`Cleanup duplicados sfactory_id — empresaId=${empresaId} — modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const webs = await prisma.productoWeb.findMany({
    where: { empresaId },
    select: {
      id: true,
      productoPadreId: true,
      sfactoryId: true,
      sfactoryCodigo: true,
      stockCache: true,
      precioCache: true,
      productoPadre: { select: { codigoAgrupacion: true } },
    },
    orderBy: { id: 'asc' },
  });

  const groups = splitKeeperAndLosers(webs);
  const loserIds = groups.flatMap((g) => g.losers.map((l) => l.id));

  if (groups.length === 0) {
    console.log('Sin duplicados por sfactory_id.');
    return;
  }

  console.log(`Grupos duplicados: ${groups.length} — filas a borrar: ${loserIds.length}\n`);

  for (const { keeper, losers } of groups) {
    const padre = keeper.productoPadre?.codigoAgrupacion ?? String(keeper.productoPadreId);
    console.log(
      `  padre=${padre} sfactoryId=${keeper.sfactoryId} → conservar id=${keeper.id} (${keeper.sfactoryCodigo})`
    );
    for (const l of losers) {
      console.log(`    borrar id=${l.id} (${l.sfactoryCodigo}) stock=${l.stockCache ?? 0}`);
    }
  }

  if (!apply) {
    console.log('\nDry-run. Ejecutá con --apply para aplicar cambios.');
    return;
  }

  const pedidosAfectados = await prisma.pedidoItem.count({
    where: { productoWebId: { in: loserIds } },
  });
  console.log(`\nPedidos items a reapuntar: ${pedidosAfectados}`);

  await prisma.$transaction(async (tx) => {
    for (const { keeper, losers } of groups) {
      for (const loser of losers) {
        await tx.pedidoItem.updateMany({
          where: { productoWebId: loser.id },
          data: { productoWebId: keeper.id },
        });

        const imagenesKeeper = await tx.productoImagen.count({
          where: { productoWebId: keeper.id },
        });
        if (imagenesKeeper === 0) {
          await tx.productoImagen.updateMany({
            where: { productoWebId: loser.id },
            data: { productoWebId: keeper.id },
          });
        }

        await tx.productoWeb.delete({ where: { id: loser.id } });
      }
    }
  });

  await CacheService.invalidateProducts(empresaId);
  console.log(`\nListo. ${loserIds.length} variantes eliminadas. Cache invalidado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
