import {
  COLORES_PARSE_ORDER,
  TALLES_MATCH_ORDER,
  GENERO_ALIASES,
  canonizarColor,
  canonizarTalle,
  normalizarClaveVariante,
  type ColorCanonico,
  type TalleCanonico,
} from '../constants/variantes-filtros';

export type IndicesParseo = {
  indicesSexo: Set<number>;
  indicesColor: Set<number>;
  indiceTalle: number;
  colorCompuestoLongitud: number;
};

/**
 * Busca talle desde el final hacia atrás (no solo la última palabra).
 * Así detecta talle aunque después haya otro token o el color esté al final sin talle.
 */
export function extraerTalleDesdePalabras(
  palabras: string[],
  indicesExcluir: Set<number> = new Set()
): { talle: TalleCanonico | null; indiceTalle: number } {
  for (let i = palabras.length - 1; i >= 0; i--) {
    if (indicesExcluir.has(i)) continue;
    const palabra = palabras[i];
    if (!palabra) continue;
    const canon = canonizarTalle(palabra);
    // UNISEX al final se resuelve en resolverUnisexFinal (género o talle según contexto)
    if (canon && canon !== 'UNISEX') {
      return { talle: canon, indiceTalle: i };
    }
  }
  return { talle: null, indiceTalle: -1 };
}

export function extraerColorDesdePalabras(
  palabras: string[],
  indicesExcluir: Set<number> = new Set()
): {
  color: ColorCanonico | null;
  indiceInicio: number;
  longitudPalabras: number;
} {
  // Más largo primero; si hay varias coincidencias, la más a la derecha (cerca del talle final)
  let mejor: {
    color: ColorCanonico;
    indiceInicio: number;
    longitudPalabras: number;
  } | null = null;

  for (const frase of COLORES_PARSE_ORDER) {
    const fraseNorm = normalizarClaveVariante(frase);
    const longitud = frase.split(/\s+/).length;

    for (let start = 0; start <= palabras.length - longitud; start++) {
      let overlap = false;
      for (let k = 0; k < longitud; k++) {
        if (indicesExcluir.has(start + k)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      const ventana = normalizarClaveVariante(
        palabras.slice(start, start + longitud).join(' ')
      );
      if (ventana !== fraseNorm) continue;

      const colorCanon = canonizarColor(ventana);
      if (!colorCanon) continue;

      if (
        !mejor ||
        longitud > mejor.longitudPalabras ||
        (longitud === mejor.longitudPalabras && start > mejor.indiceInicio)
      ) {
        mejor = {
          color: colorCanon,
          indiceInicio: start,
          longitudPalabras: longitud,
        };
      }
    }
  }

  if (!mejor) return { color: null, indiceInicio: -1, longitudPalabras: 0 };
  return mejor;
}

/** @deprecated Usar extraerColorDesdePalabras */
export function extraerColorDesdeTexto(textoNorm: string): {
  color: ColorCanonico | null;
  indiceInicio: number;
  longitudPalabras: number;
} {
  const palabras = textoNorm.split(/\s+/).filter(Boolean);
  return extraerColorDesdePalabras(palabras);
}

/** Quita H/D sueltos al final si no son género válido para el sexo ya resuelto (ej. Status D en hombre). */
export function limpiarSufijoGeneroSuelto(
  nombre: string,
  sexo: string | null | undefined
): string {
  const tokens = nombre.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return nombre.trim();
  const last = tokens[tokens.length - 1]!.toUpperCase();
  if (last.length !== 1) return nombre.trim();
  if (sexo === 'Masculino' && last === 'D') return tokens.slice(0, -1).join(' ');
  if (sexo === 'Femenino' && last === 'H') return tokens.slice(0, -1).join(' ');
  return nombre.trim();
}

export function extraerSexoDesdePalabras(
  palabras: string[],
  textoCompleto: string
): { sexoRaw: string | null; indiceSexo: number } {
  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i];
    if (!palabra) continue;
    const lower = palabra.toLowerCase().trim();
    if (GENERO_ALIASES.some((a) => a === lower)) {
      return { sexoRaw: palabra, indiceSexo: i };
    }
  }

  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i];
    if (!palabra) continue;
    const upper = palabra.toUpperCase().trim();
    if (upper === 'H' && !/\bHOMBRE\b/i.test(textoCompleto)) {
      return { sexoRaw: 'Hombre', indiceSexo: i };
    }
    if (upper === 'D' && !/\bDAMA\b/i.test(textoCompleto)) {
      return { sexoRaw: 'Dama', indiceSexo: i };
    }
  }

  return { sexoRaw: null, indiceSexo: -1 };
}

/**
 * UNISEX al final: si no hay género → género; si ya hay género → talle UNISEX.
 */
export function resolverUnisexFinal(
  palabras: string[],
  sexoRaw: string | null,
  indiceTalle: number
): { sexoRaw: string | null; talle: TalleCanonico | null; indiceTalle: number } {
  if (indiceTalle < 0 || palabras[indiceTalle]?.toUpperCase() !== 'UNISEX') {
    return { sexoRaw, talle: null, indiceTalle };
  }
  if (!sexoRaw) {
    return { sexoRaw: 'Unisex', talle: null, indiceTalle: -1 };
  }
  return { sexoRaw, talle: 'UNISEX', indiceTalle };
}

export function indicesDesdeParseo(
  indiceSexo: number,
  indiceColorInicio: number,
  colorLongitud: number,
  indiceTalle: number
): IndicesParseo {
  const indicesSexo = new Set<number>();
  if (indiceSexo >= 0) indicesSexo.add(indiceSexo);

  const indicesColor = new Set<number>();
  if (indiceColorInicio >= 0) {
    for (let i = 0; i < colorLongitud; i++) {
      indicesColor.add(indiceColorInicio + i);
    }
  }

  return {
    indicesSexo,
    indicesColor,
    indiceTalle,
    colorCompuestoLongitud: colorLongitud,
  };
}

export function construirNombreBase(
  palabras: string[],
  indices: IndicesParseo
): string {
  const partes: string[] = [];
  for (let i = 0; i < palabras.length; i++) {
    if (indices.indicesSexo.has(i)) continue;
    if (indices.indicesColor.has(i)) continue;
    if (i === indices.indiceTalle) continue;
    const p = palabras[i];
    if (p) partes.push(p);
  }
  return partes.join(' ').trim();
}

export { canonizarColor, canonizarTalle, normalizarClaveVariante };
