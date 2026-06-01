import prisma from '../src/lib/prisma';

async function main() {
  const codigos = [
    'L-OF-SAS-SA-PAL_D',
    'L-OF-SAS-SA-PALN_D',
    'L-OF-SAS-SA-PALC_D',
    'L-OF-SAS-PST_D',
    'L-OF-SAS-PST_H',
  ];
  const padres = await prisma.productoPadre.findMany({
    where: { codigoAgrupacion: { in: codigos } },
    select: {
      id: true,
      codigoAgrupacion: true,
      nombre: true,
      coloresDisponibles: true,
      genero: true,
      _count: { select: { productosWeb: true } },
    },
    orderBy: { codigoAgrupacion: 'asc' },
  });
  console.log('Padres:', JSON.stringify(padres, null, 2));

  for (const id of [56, 60]) {
    const web = await prisma.productoWeb.findFirst({
      where: { productoPadreId: id, activoSfactory: true },
      select: { nombre: true, color: true },
    });
    console.log(`Web muestra padre ${id}:`, web);
  }
}

main()
  .finally(() => prisma.$disconnect());
