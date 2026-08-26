import prisma from '../lib/prisma';
import { canonizarColor, type ColorCanonico } from '../constants/variantes-filtros';
import { COLORES_PERMITIDOS_POR_PADRE } from './colores-padre-whitelist.config';

export function tieneWhitelistColores(codigoAgrupacion: string): boolean {
  return codigoAgrupacion in COLORES_PERMITIDOS_POR_PADRE;
}

export function coloresPermitidosPadre(
  codigoAgrupacion: string
): readonly ColorCanonico[] | null {
  return COLORES_PERMITIDOS_POR_PADRE[codigoAgrupacion] ?? null;
}

export function coloresAprobadosExtraSet(
  extra?: ReadonlySet<ColorCanonico> | readonly ColorCanonico[] | null
): ReadonlySet<ColorCanonico> {
  if (!extra) return new Set();
  if (extra instanceof Set) return extra;
  return new Set(extra);
}

/** Variante permitida: config estática y/o colores aprobados en admin. */
export function colorPermitidoEnPadre(
  codigoAgrupacion: string,
  color: string | null | undefined,
  coloresAprobadosExtra?: ReadonlySet<ColorCanonico> | readonly ColorCanonico[] | null
): boolean {
  const canon = color ? canonizarColor(color) : null;
  if (!canon) return false;

  const extra = coloresAprobadosExtraSet(coloresAprobadosExtra);
  if (extra.has(canon)) return true;

  const permitidos = coloresPermitidosPadre(codigoAgrupacion);
  if (!permitidos) return true;
  return permitidos.includes(canon);
}

export function activoSfactoryConWhitelist(
  codigoAgrupacion: string,
  color: string | null | undefined,
  activoPorDepositoOSfactory: boolean,
  coloresAprobadosExtra?: ReadonlySet<ColorCanonico> | readonly ColorCanonico[] | null
): boolean {
  if (!activoPorDepositoOSfactory) return false;
  return colorPermitidoEnPadre(codigoAgrupacion, color, coloresAprobadosExtra);
}

/** Color con stock que requiere aprobación admin (whitelist estática sin incluir el color). */
export function esColorPendienteAprobacion(
  codigoAgrupacion: string,
  color: string | null | undefined,
  coloresAprobadosExtra: ReadonlySet<ColorCanonico> | readonly ColorCanonico[],
  stockCache: number
): boolean {
  if (stockCache <= 0) return false;
  if (!tieneWhitelistColores(codigoAgrupacion)) return false;
  const canon = color ? canonizarColor(color) : null;
  if (!canon) return false;
  return !colorPermitidoEnPadre(codigoAgrupacion, color, coloresAprobadosExtra);
}

export async function listarColoresAprobadosPorPadreIds(
  padreIds: number[]
): Promise<Map<number, Set<ColorCanonico>>> {
  const map = new Map<number, Set<ColorCanonico>>();
  if (padreIds.length === 0) return map;

  const rows = await prisma.productoPadreColorAprobado.findMany({
    where: { productoPadreId: { in: padreIds } },
    select: { productoPadreId: true, color: true },
  });

  for (const row of rows) {
    const canon = canonizarColor(row.color);
    if (!canon) continue;
    const set = map.get(row.productoPadreId) ?? new Set<ColorCanonico>();
    set.add(canon);
    map.set(row.productoPadreId, set);
  }
  return map;
}

export async function listarColoresAprobadosPorEmpresa(
  empresaId: number
): Promise<Map<number, Set<ColorCanonico>>> {
  const rows = await prisma.productoPadreColorAprobado.findMany({
    where: { empresaId },
    select: { productoPadreId: true, color: true },
  });
  const map = new Map<number, Set<ColorCanonico>>();
  for (const row of rows) {
    const canon = canonizarColor(row.color);
    if (!canon) continue;
    const set = map.get(row.productoPadreId) ?? new Set<ColorCanonico>();
    set.add(canon);
    map.set(row.productoPadreId, set);
  }
  return map;
}
