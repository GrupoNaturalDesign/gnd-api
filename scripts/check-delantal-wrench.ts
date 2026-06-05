import prisma from '../src/lib/prisma';

async function main() {
  const del = await prisma.productoPadre.findMany({
    where: {
      codigoAgrupacion: {
        in: ['L-WW-ACC-DEL_U', 'L-WW-ACC-DEL-DENIM_U', 'L-WW-ACC-DEL-GABARDINA_U'],
      },
    },
    include: {
      productosWeb: {
        select: { sfactoryCodigo: true, color: true, productoPadreId: true },
        orderBy: { sfactoryCodigo: 'asc' },
      },
    },
    orderBy: { codigoAgrupacion: 'asc' },
  });
  console.log('DELANTALES:');
  for (const p of del) {
    console.log(
      `  ${p.codigoAgrupacion} | ${p.nombre} | colores=${JSON.stringify(p.coloresDisponibles)}`
    );
    for (const w of p.productosWeb) {
      console.log(`    ${w.sfactoryCodigo} ${w.color}`);
    }
  }

  const wr = await prisma.productoPadre.findFirst({
    where: { codigoAgrupacion: 'L-WW-CAM-WR_H' },
    select: {
      nombre: true,
      coloresDisponibles: true,
      productosWeb: {
        select: { sfactoryCodigo: true, color: true },
        orderBy: { color: 'asc' },
        take: 15,
      },
    },
  });
  console.log('\nWRENCH H:', wr?.coloresDisponibles);
  const colores = [...new Set(wr?.productosWeb.map((w) => w.color))];
  console.log('  colores variantes (muestra):', colores);
}

main()
  .finally(() => prisma.$disconnect());
