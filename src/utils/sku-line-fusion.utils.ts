import {
  canonizarColor,
  type ColorCanonico,
} from '../constants/variantes-filtros';

function extraerCodigoAgrupacion(codigo: string): string {
  if (!codigo) return codigo;
  const match = codigo.match(/^(.+?)(\d+)$/);
  return match?.[1] ? match[1] : codigo;
}

/** Segmento completo del SKU = línea con color embebido (no recortar letra final) */
const SEGMENTO_LINEA_COLOR: Record<string, ColorCanonico> = {
  JWB: 'NEGRO',
};

/** Último segmento del SKU → color (familias Office / Sastrero) */
const SEGMENTO_EXACTO_COLOR: Record<string, ColorCanonico> = {
  PALN: 'NEGRO',
  PALC: 'CAMEL',
};

/** Sufijo de un carácter en el último segmento (mín. 4 letras antes del sufijo) */
const SUFIJO_LETRA_COLOR: Record<string, ColorCanonico> = {
  N: 'NEGRO',
  C: 'CAMEL',
};

export type SegmentoColorParse = {
  stem: string;
  color: ColorCanonico | null;
};

/**
 * Parsea el último segmento del código (sin número ni _H/_D).
 * PALN → { stem: PAL, color: NEGRO }, PALC → { stem: PAL, color: CAMEL }.
 */
export function extraerNucleoYSexoDesdeCodigo(codigo: string): {
  nucleo: string;
  sexoDesdeCodigo: string | null;
} {
  const sinNumero = extraerCodigoAgrupacion(codigo);
  let nucleo = sinNumero;
  let sexoDesdeCodigo: string | null = null;
  let m = nucleo.match(/^(.+)_([HDU])$/i);
  while (m?.[1] && m[2]) {
    const s = m[2].toUpperCase();
    sexoDesdeCodigo =
      s === 'H' ? 'Masculino' : s === 'D' ? 'Femenino' : 'Unisex';
    nucleo = m[1];
    m = nucleo.match(/^(.+)_([HDU])$/i);
  }
  return { nucleo, sexoDesdeCodigo };
}

export function parsearSegmentoColorSku(segmento: string): SegmentoColorParse {
  const seg = segmento.toUpperCase().trim();
  if (!seg) return { stem: segmento, color: null };

  const linea = SEGMENTO_LINEA_COLOR[seg];
  if (linea) {
    return { stem: seg, color: linea };
  }

  const exacto = SEGMENTO_EXACTO_COLOR[seg];
  if (exacto) {
    return { stem: seg.slice(0, -1), color: exacto };
  }

  if (seg.length >= 4) {
    const ultima = seg.slice(-1);
    const colorLetra = SUFIJO_LETRA_COLOR[ultima];
    if (colorLetra) {
      const stem = seg.slice(0, -1);
      if (stem.length >= 3) {
        return { stem, color: colorLetra };
      }
    }
  }

  return { stem: seg, color: null };
}

/** Línea Status (PST): no fusionar con familias PAL/PALN/PALC */
export function esCodigoLineaStatus(codigoBase: string): boolean {
  const partes = codigoBase.split('-');
  const ultimo = (partes[partes.length - 1] ?? '').toUpperCase();
  return ultimo === 'PST' || ultimo.startsWith('PST');
}

/**
 * Código base sin número final, con último segmento unificado (PALN|PALC → PAL).
 */
export function normalizarCodigoBaseLinea(codigo: string): {
  codigoBase: string;
  colorDesdeSku: ColorCanonico | null;
} {
  const sinNumero = extraerCodigoAgrupacion(codigo);
  const matchSexo = sinNumero.match(/^(.+)_([HDU])$/i);
  const nucleo = matchSexo?.[1] ?? sinNumero;

  const partes = nucleo.split('-');
  if (partes.length === 0) {
    return { codigoBase: nucleo, colorDesdeSku: null };
  }

  const lastIdx = partes.length - 1;
  const { stem, color } = parsearSegmentoColorSku(partes[lastIdx] ?? '');
  if (stem !== (partes[lastIdx] ?? '').toUpperCase()) {
    partes[lastIdx] = stem;
  } else if (SEGMENTO_EXACTO_COLOR[(partes[lastIdx] ?? '').toUpperCase()]) {
    partes[lastIdx] = stem;
  }

  const codigoBase = matchSexo?.[2]
    ? `${partes.join('-')}_${matchSexo[2].toUpperCase()}`
    : partes.join('-');

  return { codigoBase, colorDesdeSku: color };
}

export function inferirColorDesdeSku(codigo: string): ColorCanonico | null {
  const sinNumero = extraerCodigoAgrupacion(codigo);
  const nucleo = sinNumero.replace(/_[HDU]$/i, '');
  const ultimo = (nucleo.split('-').pop() ?? '').toUpperCase();
  return parsearSegmentoColorSku(ultimo).color;
}

export function resolverColorVariante(
  colorParseo: string | null | undefined,
  colorCampo: string | null | undefined,
  codigo: string
): ColorCanonico | null {
  const desdeCampo = colorCampo ? canonizarColor(String(colorCampo)) : null;
  if (desdeCampo) return desdeCampo;
  const desdeParseo = colorParseo ? canonizarColor(String(colorParseo)) : null;
  if (desdeParseo) return desdeParseo;
  return inferirColorDesdeSku(codigo);
}

/**
 * Clave de grupo fusionada: mismo padre para PALN + PALC (mismo sexo).
 * Status (PST) queda en su propia clave, sin mezclar con PAL.
 */
export function resolverClaveGrupoFusion(
  codigo: string,
  sexoNormalizado: string | null
): {
  claveGrupo: string;
  codigoBaseSinSufijo: string;
  colorDesdeSku: ColorCanonico | null;
} {
  const { nucleo: nucleoInicial, sexoDesdeCodigo } = extraerNucleoYSexoDesdeCodigo(codigo);

  const partes = nucleoInicial.split('-');
  let colorDesdeSku: ColorCanonico | null = null;
  if (partes.length > 0) {
    const lastIdx = partes.length - 1;
    const parsed = parsearSegmentoColorSku(partes[lastIdx] ?? '');
    if (parsed.color) {
      colorDesdeSku = parsed.color;
      partes[lastIdx] = parsed.stem;
    }
  }
  const nucleoFusionado = partes.join('-');

  const sexoFinal = sexoNormalizado ?? sexoDesdeCodigo;
  const sufijoSexo =
    sexoFinal === 'Masculino' ? 'H' : sexoFinal === 'Femenino' ? 'D' : 'U';
  const claveGrupo = `${nucleoFusionado}_${sufijoSexo}`;

  return { claveGrupo, codigoBaseSinSufijo: nucleoFusionado, colorDesdeSku };
}

/** Códigos de padre legacy que pueden unificar al fusionado (ej. PAL_D → PALN_D, PALC_D) */
export function aliasCodigosAgrupacionPadre(codigoAgrupacion: string): string[] {
  const aliases = new Set<string>([codigoAgrupacion]);
  const m = codigoAgrupacion.match(/^(.+)_([HDU])$/i);
  if (!m?.[1] || !m[2]) return [...aliases];

  const partes = m[1].split('-');
  const lastIdx = partes.length - 1;
  const stem = (partes[lastIdx] ?? '').toUpperCase();
  const sex = m[2].toUpperCase();

  const variantesSegmento: string[] = [stem];
  if (stem === 'PAL') {
    variantesSegmento.push('PALN', 'PALC');
  }

  for (const seg of variantesSegmento) {
    const p = [...partes];
    p[lastIdx] = seg;
    aliases.add(`${p.join('-')}_${sex}`);
  }

  return [...aliases];
}
