import {
  colorPermitidoEnPadre,
  esColorPendienteAprobacion,
  tieneWhitelistColores,
} from '../config/colores-padre-whitelist.utils';
import type { ColorCanonico } from '../constants/variantes-filtros';

export type VarianteBloqueadaWhitelist = {
  codigoAgrupacion: string;
  sfactoryCodigo: string;
  color: string;
  stock: number;
};

export const DETALLE_BLOQUEADAS_WHITELIST_MAX = 50;

export type MotivoInactivoVariante =
  | 'activa'
  | 'sin_stock_deposito'
  | 'pendiente_aprobacion'
  | 'sin_color';

/** @deprecated usar pendiente_aprobacion */
export type MotivoInactivoLegacy = MotivoInactivoVariante | 'color_no_permitido';

/** Por qué una variante no está activa en tienda (admin). */
export function motivoInactivoVariante(
  codigoAgrupacion: string,
  color: string | null | undefined,
  activoSfactory: boolean,
  stockCache?: number | null,
  coloresAprobadosExtra?: ReadonlySet<ColorCanonico> | readonly ColorCanonico[]
): MotivoInactivoVariante {
  if (activoSfactory) return 'activa';
  if (!color?.trim()) return 'sin_color';
  const stock = Number(stockCache ?? 0);
  if (
    esColorPendienteAprobacion(
      codigoAgrupacion,
      color,
      coloresAprobadosExtra ?? [],
      stock
    )
  ) {
    return 'pendiente_aprobacion';
  }
  if (
    tieneWhitelistColores(codigoAgrupacion) &&
    !colorPermitidoEnPadre(codigoAgrupacion, color, coloresAprobadosExtra)
  ) {
    return 'pendiente_aprobacion';
  }
  return 'sin_stock_deposito';
}

export function esBloqueoPorWhitelist(
  codigoAgrupacion: string,
  color: string | null | undefined,
  activoPorDeposito: boolean,
  coloresAprobadosExtra?: ReadonlySet<ColorCanonico> | readonly ColorCanonico[]
): boolean {
  if (!activoPorDeposito) return false;
  if (!color?.trim()) return false;
  if (!tieneWhitelistColores(codigoAgrupacion)) return false;
  return !colorPermitidoEnPadre(codigoAgrupacion, color, coloresAprobadosExtra);
}

export function registrarBloqueoWhitelist(
  acc: VarianteBloqueadaWhitelist[],
  seen: Set<string>,
  row: VarianteBloqueadaWhitelist
): void {
  if (seen.has(row.sfactoryCodigo)) return;
  if (acc.length >= DETALLE_BLOQUEADAS_WHITELIST_MAX) return;
  seen.add(row.sfactoryCodigo);
  acc.push(row);
}

export function dedupeBloqueadasWhitelist(
  listas: VarianteBloqueadaWhitelist[][]
): { count: number; detalle: VarianteBloqueadaWhitelist[] } {
  const seen = new Set<string>();
  const detalle: VarianteBloqueadaWhitelist[] = [];
  for (const lista of listas) {
    for (const row of lista) {
      registrarBloqueoWhitelist(detalle, seen, row);
    }
  }
  return { count: seen.size, detalle };
}
