import {
  canonizarColor,
  type ColorCanonico,
} from '../constants/variantes-filtros';
import { resolverColorVariante } from './sku-line-fusion.utils';

/** Patrones en descripción S-Factory (orden: más específico primero). */
const DESCRIPCION_COLOR_PATTERNS: ReadonlyArray<{
  test: (texto: string) => boolean;
  color: ColorCanonico;
}> = [
  { test: (t) => /\bGRIS\s+MEL\s+CL\b/i.test(t), color: 'GRIS MELANGE' },
  { test: (t) => /\bGRIS\s+MEL\s+OS\b/i.test(t), color: 'GRIS MELANGE' },
  { test: (t) => /\bGRIS\s+MELANGE\b/i.test(t), color: 'GRIS MELANGE' },
  { test: (t) => /\bGRIS\s+PERLA\b/i.test(t), color: 'GRIS PERLA' },
  { test: (t) => /\bGRIS\s+TOPO\b/i.test(t), color: 'GRIS TOPO' },
  { test: (t) => /\bGRIS\s+ACERO\b/i.test(t), color: 'GRIS ACERO' },
  { test: (t) => /\bAZUL\s+MARINO\b/i.test(t), color: 'AZUL MARINO' },
  { test: (t) => /\bAZUL\s+MAR\b/i.test(t), color: 'AZUL MARINO' },
  { test: (t) => /\bRAY\s+COMBINADA\b/i.test(t), color: 'RAYAS 1: COMBINADAS' },
  { test: (t) => /\bRAY\s+AZUL\b/i.test(t), color: 'RAYAS 2: FINA AZUL' },
  { test: (t) => /\bRAY\s+CEL\b/i.test(t), color: 'CELESTE' },
  { test: (t) => /\bRAYADO\s+CELESTE\b/i.test(t), color: 'RAYADO CELESTE ANCHO' },
  /** ACERO como color (ej. Remera Base Pro Dama ACERO M) */
  {
    test: (t) => /\bACERO\b/i.test(t) && !/\bGRIS\s+ACERO\b/i.test(t),
    color: 'GRIS ACERO',
  },
  { test: (t) => /\bNEG\b/i.test(t) && !/\bNEGRO\b/i.test(t), color: 'NEGRO' },
];

export function colorDesdePatronesDescripcion(
  descripcion: string | null | undefined
): ColorCanonico | null {
  if (!descripcion?.trim()) return null;
  const texto = descripcion.trim();
  for (const { test, color } of DESCRIPCION_COLOR_PATTERNS) {
    if (test(texto)) return color;
  }
  return null;
}

/** Si la descripción indica azul marino, no degradar a AZUL suelto. */
export function elevarAzulMarinoDesdeDescripcion(
  descripcion: string | null | undefined,
  color: ColorCanonico | null
): ColorCanonico | null {
  if (!color || !descripcion?.trim()) return color;
  if (color !== 'AZUL') return color;
  const t = descripcion.trim();
  if (/\bAZUL\s+MAR(INO)?\b/i.test(t) || /\bAZUL\s+MAR\b/i.test(t)) {
    return 'AZUL MARINO';
  }
  return color;
}

/**
 * Lista de colores de padre sin duplicar AZUL cuando ya hay AZUL MARINO.
 */
export function consolidarColoresCanonico(
  colores: Iterable<string | null | undefined>
): ColorCanonico[] {
  const set = new Set<ColorCanonico>();
  for (const c of colores) {
    const can = c ? canonizarColor(c) : null;
    if (can) set.add(can);
  }
  if (set.has('AZUL MARINO') && set.has('AZUL')) {
    set.delete('AZUL');
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Color de variante: patrones ERP en descripción → parseo nombre → SKU.
 * Evita que "GRIS MEL CL" se interprete solo como alias CL → CELESTE.
 */
export function resolverColorDesdeSfactory(
  descripcion: string | null | undefined,
  colorParseo: string | null | undefined,
  colorCampo: string | null | undefined,
  codigo: string
): ColorCanonico | null {
  const desdeDesc = colorDesdePatronesDescripcion(descripcion);
  if (desdeDesc) return desdeDesc;
  const resuelto = resolverColorVariante(colorParseo, colorCampo, codigo);
  return elevarAzulMarinoDesdeDescripcion(descripcion, resuelto);
}

export function colorCanonicoValido(
  color: string | null | undefined
): ColorCanonico | null {
  if (!color?.trim()) return null;
  return canonizarColor(color);
}
