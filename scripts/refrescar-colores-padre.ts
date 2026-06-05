import prisma from '../src/lib/prisma';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../src/config/ecommerce.config';
import {
  publicarPadresSublineaAlineados,
  refrescarColoresDisponiblesPadres,
} from '../src/utils/padre-colores-sync.utils';

async function main() {
  const empresaId = parseInt(process.argv[2] || '1', 10);
  const codigosArg = process.argv.slice(3);

  const rubros = await prisma.rubro.findMany({
    where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
    select: { id: true },
  });
  const rubroIds = rubros.map((r) => r.id);

  let padreIds: number[] | undefined;
  if (codigosArg.length > 0) {
    const padres = await prisma.productoPadre.findMany({
      where: { empresaId, codigoAgrupacion: { in: codigosArg } },
      select: { id: true },
    });
    padreIds = padres.map((p) => p.id);
  }

  const pub = await publicarPadresSublineaAlineados(prisma, empresaId);
  const col = await refrescarColoresDisponiblesPadres(
    prisma,
    empresaId,
    rubroIds,
    padreIds
  );
  console.log({ publicadosSublinea: pub.publicados, coloresRefrescados: col.padresActualizados });
}

main().finally(() => prisma.$disconnect());
