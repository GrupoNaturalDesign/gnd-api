import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { consolidarColoresCanonico } from './sfactory-color-parse.utils';

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Padre creado por sublínea en descripción (Denim / Gabardina). */
export function esPadreSublineaSfactory(codigoAgrupacion: string): boolean {
  return /-(DENIM|GABARDINA)_[HDU]$/i.test(codigoAgrupacion);
}

/** Ej. L-WW-ACC-DEL-DENIM_U → L-WW-ACC-DEL_U */
export function codigoAgrupacionPadreBase(
  codigoAgrupacion: string
): string | null {
  const m = codigoAgrupacion.match(/^(.+)-(DENIM|GABARDINA)(_[HDU])$/i);
  if (!m?.[1] || !m[3]) return null;
  return `${m[1]}${m[3]}`;
}

/**
 * Sublínea nueva: publicar si el padre base ya está publicado (o por defecto true en sublínea).
 */
export async function resolverPublicadoPadreNuevo(
  db: DbClient,
  empresaId: number,
  codigoAgrupacion: string
): Promise<boolean> {
  if (!esPadreSublineaSfactory(codigoAgrupacion)) {
    return false;
  }
  const baseCodigo = codigoAgrupacionPadreBase(codigoAgrupacion);
  if (!baseCodigo) return true;
  const base = await db.productoPadre.findFirst({
    where: { empresaId, codigoAgrupacion: baseCodigo },
    select: { publicado: true },
  });
  return base?.publicado ?? true;
}

/**
 * `colores_disponibles` solo desde variantes activo_sfactory=true (sin duplicar AZUL/MARINO).
 */
export async function refrescarColoresDisponiblesPadres(
  db: DbClient,
  empresaId: number,
  rubroIds: number[],
  padreIds?: number[]
): Promise<{ padresActualizados: number }> {
  if (rubroIds.length === 0) {
    return { padresActualizados: 0 };
  }

  const padres = await db.productoPadre.findMany({
    where: {
      empresaId,
      rubroId: { in: rubroIds },
      ...(padreIds?.length ? { id: { in: padreIds } } : {}),
    },
    select: { id: true },
  });

  if (padres.length === 0) {
    return { padresActualizados: 0 };
  }

  const ids = padres.map((p) => p.id);
  const variantes = await db.productoWeb.findMany({
    where: {
      empresaId,
      activoSfactory: true,
      productoPadreId: { in: ids },
    },
    select: { productoPadreId: true, color: true },
  });

  const coloresPorPadre = new Map<number, string[]>();
  for (const v of variantes) {
    const list = coloresPorPadre.get(v.productoPadreId) ?? [];
    if (v.color) list.push(v.color);
    coloresPorPadre.set(v.productoPadreId, list);
  }

  let padresActualizados = 0;
  for (const padreId of ids) {
    const colores = consolidarColoresCanonico(coloresPorPadre.get(padreId) ?? []);
    await db.productoPadre.update({
      where: { id: padreId },
      data: {
        coloresDisponibles:
          colores.length > 0
            ? (colores as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    padresActualizados++;
  }

  return { padresActualizados };
}

/** Publica padres sublínea cuyo padre base ya está publicado (ej. Denim tras Chill). */
export async function publicarPadresSublineaAlineados(
  db: DbClient,
  empresaId: number
): Promise<{ publicados: number }> {
  const sublineas = await db.productoPadre.findMany({
    where: {
      empresaId,
      publicado: false,
    },
    select: { id: true, codigoAgrupacion: true },
  });

  let publicados = 0;
  for (const p of sublineas) {
    if (!esPadreSublineaSfactory(p.codigoAgrupacion)) continue;
    const baseCodigo = codigoAgrupacionPadreBase(p.codigoAgrupacion);
    if (!baseCodigo) continue;
    const base = await db.productoPadre.findFirst({
      where: { empresaId, codigoAgrupacion: baseCodigo, publicado: true },
      select: { id: true },
    });
    if (!base) continue;
    await db.productoPadre.update({
      where: { id: p.id },
      data: { publicado: true },
    });
    publicados++;
  }

  return { publicados };
}
