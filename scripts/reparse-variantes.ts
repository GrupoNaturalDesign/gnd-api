/**
 * Re-parsea color/talle/sexo/nombre desde productos_sfactory.descripcion
 * y fusiona padres por clave SKU (PALN+PALC → PAL_D).
 *
 * Uso: npx ts-node --transpile-only scripts/reparse-variantes.ts [empresaId]
 */
import prisma from '../src/lib/prisma';
import {
  parsearNombreProducto,
  elegirNombreBase,
} from '../src/services/producto-agrupacion.service';
import {
  resolverClaveGrupoFusion,
  resolverColorVariante,
  esCodigoLineaStatus,
} from '../src/utils/sku-line-fusion.utils';
import { limpiarSufijoGeneroSuelto } from '../src/utils/variantes-parse.utils';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../src/config/ecommerce.config';

function generarSlug(text: string, codigo: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const codigoSlug = codigo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${base}-${codigoSlug}`.substring(0, 255);
}

async function main() {
  const empresaId = parseInt(process.argv[2] || '1', 10);
  const rubros = await prisma.rubro.findMany({
    where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
    select: { id: true },
  });
  const rubroIds = rubros.map((r) => r.id);

  const items = await prisma.productoSfactory.findMany({
    where: {
      empresaId,
      ...(rubroIds.length > 0 && { rubro_id: { in: rubroIds } }),
    },
    select: { codigo: true, descripcion: true, descrip_corta: true },
  });

  let webActualizados = 0;
  let sinColor = 0;
  let sinTalle = 0;

  for (const item of items) {
    const desc = item.descripcion || item.descrip_corta || item.codigo;
    const parseado = parsearNombreProducto(desc, item.codigo);
    const color = resolverColorVariante(parseado.color, null, item.codigo);
    const nombre = (parseado.nombreBase || desc).trim();

    const web = await prisma.productoWeb.findFirst({
      where: { empresaId, sfactoryCodigo: item.codigo },
      select: { id: true },
    });
    if (!web) continue;

    if (!color) sinColor++;
    if (!parseado.talle) sinTalle++;

    await prisma.productoWeb.update({
      where: { id: web.id },
      data: {
        color,
        talle: parseado.talle,
        sexo: parseado.sexo,
        nombre,
      },
    });
    webActualizados++;
  }

  const padres = await prisma.productoPadre.findMany({
    where: { empresaId, ...(rubroIds.length > 0 && { rubroId: { in: rubroIds } }) },
    select: {
      id: true,
      codigoAgrupacion: true,
      genero: true,
    },
  });

  for (const padre of padres) {
    const variantes = await prisma.productoWeb.findMany({
      where: { productoPadreId: padre.id, activoSfactory: true },
      select: { color: true, talle: true, sexo: true, nombre: true },
    });
    const colores = Array.from(
      new Set(variantes.map((v) => v.color).filter((c): c is string => !!c))
    ).sort();
    const talles = Array.from(
      new Set(variantes.map((v) => v.talle).filter((t): t is string => !!t))
    );
    const sexos = variantes.map((v) => v.sexo).filter(Boolean);
    const genero =
      sexos.length > 0 && new Set(sexos).size === 1 ? (sexos[0] as string) : undefined;

    let nombrePadre = '';
    for (const v of variantes) {
      if (v.nombre) nombrePadre = elegirNombreBase(nombrePadre, v.nombre);
    }
    if (nombrePadre && genero) {
      nombrePadre = limpiarSufijoGeneroSuelto(nombrePadre, genero);
    }

    await prisma.productoPadre.update({
      where: { id: padre.id },
      data: {
        coloresDisponibles: colores.length > 0 ? colores : null,
        tallesDisponibles: talles.length > 0 ? talles : null,
        ...(genero && { genero }),
        ...(nombrePadre && {
          nombre: nombrePadre,
          slug: generarSlug(nombrePadre, padre.codigoAgrupacion),
        }),
      },
    });
  }

  let fusiones = 0;
  const fusionMap = new Map<string, number[]>();

  for (const padre of padres) {
    const nucleoSinSexo = padre.codigoAgrupacion.replace(/_[HDU]$/i, '');
    const ultimoSeg = (nucleoSinSexo.split('-').pop() ?? '').toUpperCase();
    if (esCodigoLineaStatus(ultimoSeg)) continue;

    const { claveGrupo } = resolverClaveGrupoFusion(
      padre.codigoAgrupacion,
      padre.genero
    );
    const ids = fusionMap.get(claveGrupo) ?? [];
    ids.push(padre.id);
    fusionMap.set(claveGrupo, ids);
  }

  for (const [claveGrupo, ids] of fusionMap) {
    if (ids.length < 2) continue;

    const candidatos = await prisma.productoPadre.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigoAgrupacion: true, nombre: true, genero: true },
      orderBy: { id: 'asc' },
    });
    const canonico = candidatos[0]!;
    const otros = candidatos.slice(1);

    let nombreFusion = canonico.nombre;
    for (const c of candidatos) {
      nombreFusion = elegirNombreBase(nombreFusion, c.nombre);
    }
    if (canonico.genero) {
      nombreFusion = limpiarSufijoGeneroSuelto(nombreFusion, canonico.genero);
    }

    for (const otro of otros) {
      await prisma.productoWeb.updateMany({
        where: { productoPadreId: otro.id, empresaId },
        data: { productoPadreId: canonico.id },
      });
      await prisma.productoPadre.delete({ where: { id: otro.id } });
    }

    const variantesCanon = await prisma.productoWeb.findMany({
      where: { productoPadreId: canonico.id, activoSfactory: true },
      select: { color: true, talle: true, sexo: true },
    });
    const colores = Array.from(
      new Set(variantesCanon.map((v) => v.color).filter((c): c is string => !!c))
    ).sort();
    const talles = Array.from(
      new Set(variantesCanon.map((v) => v.talle).filter((t): t is string => !!t))
    );
    const sexos = variantesCanon.map((v) => v.sexo).filter(Boolean);
    const genero =
      sexos.length > 0 && new Set(sexos).size === 1 ? (sexos[0] as string) : undefined;

    await prisma.productoPadre.update({
      where: { id: canonico.id },
      data: {
        codigoAgrupacion: claveGrupo,
        nombre: nombreFusion,
        slug: generarSlug(nombreFusion, claveGrupo),
        coloresDisponibles: colores.length > 0 ? colores : null,
        tallesDisponibles: talles.length > 0 ? talles : null,
        ...(genero && { genero }),
      },
    });
    fusiones++;
    console.log(`  fusionado → ${claveGrupo} (padre ${canonico.id}, +${otros.length} legacy)`);
  }

  console.log(`Reparse empresaId=${empresaId}`);
  console.log(`  variantes actualizadas: ${webActualizados}`);
  console.log(`  sin color detectado: ${sinColor}`);
  console.log(`  sin talle detectado: ${sinTalle}`);
  console.log(`  padres recalculados: ${padres.length}`);
  console.log(`  fusiones PAL/PALN/PALC: ${fusiones}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
