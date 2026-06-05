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

/** Variante permitida por assortiment NTDS (null color → no permitido si hay whitelist). */
export function colorPermitidoEnPadre(
  codigoAgrupacion: string,
  color: string | null | undefined
): boolean {
  const permitidos = coloresPermitidosPadre(codigoAgrupacion);
  if (!permitidos) return true;
  const canon = color ? canonizarColor(color) : null;
  if (!canon) return false;
  return permitidos.includes(canon);
}

export function activoSfactoryConWhitelist(
  codigoAgrupacion: string,
  color: string | null | undefined,
  activoPorDepositoOSfactory: boolean
): boolean {
  if (!activoPorDepositoOSfactory) return false;
  return colorPermitidoEnPadre(codigoAgrupacion, color);
}
