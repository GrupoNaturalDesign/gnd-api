/**
 * Corrige talle ESSE8 y recalcula tallesDisponibles del padre Sweater Essence (id 62).
 * Uso: npx ts-node --transpile-only scripts/fix-esse8-talle.ts
 */
import prisma from '../src/lib/prisma';
import { parsearNombreProducto } from '../src/services/producto-agrupacion.service';
import { resolverColorDesdeSfactory } from '../src/utils/sfactory-color-parse.utils';
import { filterTallesForWeb } from '../src/utils/web-talles.util';

const ESSE8_CODIGO = 'L-OF-TEJ- SW - ESSE8';
const PADRE_ID = 62;

async function main() {
  const sf = await prisma.productoSfactory.findFirst({
    where: { codigo: ESSE8_CODIGO },
    select: { descripcion: true, descrip_corta: true, codigo: true },
  });

  if (!sf) {
    console.error(`No se encontró producto_sfactory para ${ESSE8_CODIGO}`);
    process.exit(1);
  }

  const desc = sf.descripcion || sf.descrip_corta || sf.codigo;
  const parseado = parsearNombreProducto(desc, sf.codigo);
  const color = resolverColorDesdeSfactory(desc, parseado.color, null, sf.codigo);

  const antes = await prisma.productoWeb.findFirst({
    where: { sfactoryCodigo: ESSE8_CODIGO },
    select: { id: true, talle: true, color: true, nombre: true, productoPadreId: true },
  });

  console.log('Descripción SF:', desc);
  console.log('Parseado:', parseado);
  console.log('Antes:', antes);

  if (!antes) {
    console.error('No se encontró producto_web para ESSE8');
    process.exit(1);
  }

  await prisma.productoWeb.update({
    where: { id: antes.id },
    data: {
      talle: parseado.talle,
      color,
      sexo: parseado.sexo,
      nombre: (parseado.nombreBase || desc).trim(),
    },
  });

  const padreId = antes.productoPadreId ?? PADRE_ID;
  const variantes = await prisma.productoWeb.findMany({
    where: { productoPadreId: padreId, activoSfactory: true },
    select: { talle: true },
  });

  const tallesPadre = filterTallesForWeb(
    Array.from(
      new Set(variantes.map((v) => v.talle).filter((t): t is string => !!t)),
    ),
  ).sort();

  await prisma.productoPadre.update({
    where: { id: padreId },
    data: { tallesDisponibles: tallesPadre.length > 0 ? tallesPadre : null },
  });

  const despues = await prisma.productoWeb.findFirst({
    where: { id: antes.id },
    select: { id: true, talle: true, color: true, nombre: true },
  });

  console.log('Después ESSE8:', despues);
  console.log('tallesDisponibles padre', padreId, ':', tallesPadre);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
