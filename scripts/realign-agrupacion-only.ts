import prisma from '../src/lib/prisma';
import { realinearVariantesAgrupacionCanonica } from '../src/utils/sfactory-realign-agrupacion.utils';

async function main() {
  const empresaId = parseInt(process.argv[2] || '1', 10);
  const rubros = await prisma.rubro.findMany({
    where: { empresaId, sfactoryId: { in: [3285, 3314] } },
    select: { id: true },
  });
  const productos = await prisma.productoSfactory.findMany({
    where: { empresaId, activo: 'S', rubro_id: { in: [3285, 3314] } },
  });
  const map = new Map(productos.map((p) => [p.codigo, p]));
  const r = await prisma.$transaction(
    (tx) =>
      realinearVariantesAgrupacionCanonica(
        tx,
        empresaId,
        map,
        rubros.map((x) => x.id)
      ),
    { timeout: 120_000, maxWait: 30_000 }
  );
  console.log(r);
}

main().finally(() => prisma.$disconnect());
