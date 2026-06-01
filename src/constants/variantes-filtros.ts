/**
 * Whitelist ERP para segmentar variantes desde descripciones SFactory.
 * Orden de matching: siempre más largo primero (COLORES_MATCH_ORDER / TALLES_MATCH_ORDER).
 */

export const COLORES_CANONICOS = [
  'ARENA',
  'AZUL',
  'AZUL MARINO',
  'BEIGE',
  'BLANCO',
  'CAMEL',
  'CELESTE',
  'CEMENTO',
  'GRIS',
  'GRIS ACERO',
  'GRIS MELANGE',
  'GRIS PERLA',
  'GRIS TOPO',
  'MELANGE',
  'NEGRO',
  'RAYADO CELESTE ANCHO',
  'RAYAS 1: CELESTE',
  'RAYAS 1: COMBINADAS',
  'RAYAS 2: COMBINADAS',
  'RAYAS 2: FINA AZUL',
  'TOSTADO',
  'VERDE MILITAR',
] as const;

export type ColorCanonico = (typeof COLORES_CANONICOS)[number];

/** Alias en descripción/nombre → color canónico ERP */
export const COLOR_ALIASES: Record<string, ColorCanonico> = {
  BLACK: 'NEGRO',
  NEGRA: 'NEGRO',
  BLANCA: 'BLANCO',
  WHITE: 'BLANCO',
  MEL: 'MELANGE',
  CL: 'CELESTE',
};

/** Frases a buscar al parsear (canónicos + alias), más largas primero */
export const COLORES_PARSE_ORDER: readonly string[] = [
  ...COLORES_CANONICOS,
  ...Object.keys(COLOR_ALIASES),
].sort((a, b) => b.length - a.length);

export const TALLES_CANONICOS = [
  '2XS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '34',
  '36',
  '38',
  '40',
  '42',
  '44',
  '46',
  '48',
  '50',
  '52',
  '54',
  '56',
  'UNISEX',
  'OS',
] as const;

export type TalleCanonico = (typeof TALLES_CANONICOS)[number];

/** Aliases de género → se resuelven con normalizarSexo() a Masculino/Femenino/Unisex */
export const GENERO_ALIASES = [
  'masculino',
  'femenino',
  'unisex',
  'hombre',
  'mujer',
  'dama',
  'damas',
  'niño',
  'niña',
  'm',
  'f',
  'uni',
] as const;

/** Orden de búsqueda (longitud descendente) */
export const COLORES_MATCH_ORDER: readonly string[] = [...COLORES_CANONICOS].sort(
  (a, b) => b.length - a.length
);

export const TALLES_MATCH_ORDER: readonly string[] = [...TALLES_CANONICOS].sort(
  (a, b) => b.length - a.length
);

const COLORES_NORMALIZADOS_MAP = new Map<string, ColorCanonico>(
  COLORES_CANONICOS.map((c) => [normalizarClaveVariante(c), c])
);

export function normalizarClaveVariante(texto: string): string {
  return texto
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function canonizarColor(valor: string | null | undefined): ColorCanonico | null {
  if (!valor) return null;
  const clave = normalizarClaveVariante(valor);
  const alias = COLOR_ALIASES[clave];
  if (alias) return alias;
  return COLORES_NORMALIZADOS_MAP.get(clave) ?? null;
}

export function canonizarTalle(valor: string | null | undefined): TalleCanonico | null {
  if (!valor) return null;
  const upper = valor.trim().toUpperCase();
  return (TALLES_CANONICOS as readonly string[]).find((t) => t === upper) as TalleCanonico | null;
}

/** Mapea filtro de catálogo (URL/navbar) al valor persistido en BD */
export function generoFiltroAValorBd(genero?: string | null): string | null {
  if (!genero || String(genero).toUpperCase() === 'TODOS') return null;
  const g = genero.toLowerCase().trim();
  if (g === 'dama' || g === 'femenino' || g === 'mujer') return 'Femenino';
  if (g === 'hombre' || g === 'masculino') return 'Masculino';
  if (g === 'unisex' || g === 'uni') return 'Unisex';
  const upper = genero.toUpperCase().trim();
  if (upper === 'DAMA') return 'Femenino';
  if (upper === 'HOMBRE') return 'Masculino';
  if (upper === 'UNISEX') return 'Unisex';
  return genero.trim();
}
