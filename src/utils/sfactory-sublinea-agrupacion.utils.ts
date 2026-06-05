/**
 * Sublíneas en descripción S-Factory (ej. "Delantal Chill Denim") que comparten
 * prefijo de SKU (L-WW-ACC-DEL2/3/4) pero deben ser productos padre distintos en tienda.
 */

export type SufijoSublineaAgrupacion = '-DENIM' | '-GABARDINA';

const ETIQUETA_SUBLINEA: Record<SufijoSublineaAgrupacion, string> = {
  '-DENIM': 'Denim',
  '-GABARDINA': 'Gabardina',
};

function normalizarTextoSublinea(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Detecta sublínea por palabra en descripción (Denim / Gabardina).
 * Gabardina tiene prioridad si ambas aparecieran (caso raro).
 */
export function detectarSufijoSublineaAgrupacion(
  descripcion: string
): SufijoSublineaAgrupacion | null {
  if (!descripcion?.trim()) return null;
  const t = normalizarTextoSublinea(descripcion);
  if (/\bgabardina\b/.test(t)) return '-GABARDINA';
  if (/\bdenim\b/.test(t)) return '-DENIM';
  return null;
}

/** Inserta sufijo antes del marcador de sexo (_U/_H/_D). */
export function aplicarSublineaACodigoAgrupacion(
  codigoAgrupacion: string,
  sufijoSublinea: SufijoSublineaAgrupacion
): string {
  const m = codigoAgrupacion.match(/^(.+)_([HDU])$/i);
  if (!m?.[1] || !m[2]) {
    const base = codigoAgrupacion.endsWith(sufijoSublinea)
      ? codigoAgrupacion
      : codigoAgrupacion + sufijoSublinea;
    return base;
  }
  const nucleo = m[1];
  if (nucleo.endsWith(sufijoSublinea)) {
    return `${nucleo}_${m[2].toUpperCase()}`;
  }
  return `${nucleo}${sufijoSublinea}_${m[2].toUpperCase()}`;
}

/** Nombre de padre con sublínea si la descripción la incluye y el parseo no. */
export function enriquecerNombreBaseSublinea(
  nombreBase: string,
  descripcion: string
): string {
  const sufijo = detectarSufijoSublineaAgrupacion(descripcion);
  if (!sufijo || !nombreBase?.trim()) return nombreBase;
  const etiqueta = ETIQUETA_SUBLINEA[sufijo];
  if (normalizarTextoSublinea(nombreBase).includes(etiqueta.toLowerCase())) {
    return nombreBase;
  }
  return `${nombreBase.trim()} ${etiqueta}`.trim();
}
