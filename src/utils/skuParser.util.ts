/**
 * Utilidades para parsear SKUs y extraer información de productos
 */

export interface ParsedSKU {
  skuBase: string;
  nombreBase: string;
  color: string | null;
  talle: string | null;
  sexo: string | null;
}

/**
 * Extrae la base del SKU removiendo números finales
 * Ejemplo: "1123573L-WW-CAM-WR10000000679" -> "1123573L-WW-CAM-WR"
 */
export function extractSKUBase(sku: string): string {
  if (!sku) return sku;

  // Buscar el último número al final del SKU
  const match = sku.match(/^(.+?)(\d+)$/);
  if (match && match[1]) {
    return match[1];
  }

  return sku;
}

/**
 * Parsea una descripción de producto para extraer información
 * Ejemplo: "Camisa Wrench Hombre Cemento 32" ->
 *   { nombreBase: "Camisa Wrench", sexo: "Hombre", color: "Cemento", talle: "32" }
 */
export function parseProductDescription(descripcion: string): ParsedSKU {
  if (!descripcion) {
    return {
      skuBase: '',
      nombreBase: '',
      color: null,
      talle: null,
      sexo: null,
    };
  }

  const palabrasSexo = ['hombre', 'mujer', 'dama', 'damas', 'unisex', 'niño', 'niña'];
  const palabras = descripcion.trim().split(/\s+/);

  let sexo: string | null = null;
  let talle: string | null = null;
  let color: string | null = null;
  const nombrePartes: string[] = [];

  // Buscar sexo
  let indiceSexo = -1;
  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i];
    if (!palabra) continue;
    const palabraLower = palabra.toLowerCase();
    const sexoEncontrado = palabrasSexo.find(
      (s) =>
        palabraLower === s ||
        palabraLower.startsWith(s) ||
        palabraLower.includes(s)
    );
    if (sexoEncontrado) {
      if (palabraLower === 'dama' || palabraLower === 'damas') {
        sexo = 'Mujer';
      } else {
        sexo = palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
      }
      indiceSexo = i;
      break;
    }
  }

  // Lista de colores comunes
  const colores = [
    'negro',
    'blanco',
    'azul',
    'gris',
    'rojo',
    'verde',
    'amarillo',
    'naranja',
    'rosa',
    'violeta',
    'beige',
    'marron',
    'marrón',
    'azul marino',
    'azulmarino',
    'gris perla',
    'grisperla',
    'gris melange',
    'grismelange',
    'gris topo',
    'gristopo',
    'cemento',
    'celeste',
    'lavado oscuro',
    'lavadooscuro',
    'lavado claro',
    'lavadoclaro',
    'lavado medio',
    'lavadomedio',
  ];

  // Buscar talle (número o código al final)
  const patronTalle = /^(\d+|2XS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL)$/i;
  let indiceTalle = -1;

  // Buscar desde el final hacia atrás
  for (let i = palabras.length - 1; i >= 0; i--) {
    const palabra = palabras[i];
    if (!palabra) continue;
    if (patronTalle.test(palabra)) {
      talle = palabra;
      indiceTalle = i;
      break;
    }
  }

  // Buscar color
  let indiceColor = -1;

  // Primero intentar encontrar color compuesto (2 palabras)
  for (let i = 0; i < palabras.length - 1; i++) {
    const colorCompuesto = `${palabras[i]} ${palabras[i + 1]}`.toLowerCase();
    if (colores.includes(colorCompuesto)) {
      color = `${palabras[i]} ${palabras[i + 1]}`;
      indiceColor = i;
      break;
    }
  }

  // Si no encontramos color compuesto, buscar color simple
  if (!color) {
    if (indiceTalle > 0) {
      indiceColor = indiceTalle - 1;
      if (indiceColor !== indiceSexo && indiceColor >= 0) {
        const palabra = palabras[indiceColor];
        if (palabra) {
          const palabraLower = palabra.toLowerCase();
          if (colores.some((c) => palabraLower.includes(c) || c.includes(palabraLower))) {
            color = palabra;
          }
        }
      }
    }

    if (!color && indiceSexo >= 0 && indiceSexo < palabras.length - 1) {
      for (let i = indiceSexo + 1; i < palabras.length; i++) {
        if (i === indiceTalle) continue;
        const palabra = palabras[i];
        if (!palabra) continue;
        const palabraLower = palabra.toLowerCase();
        if (colores.some((c) => palabraLower.includes(c) || c.includes(palabraLower))) {
          color = palabra;
          indiceColor = i;
          break;
        }
      }
    }
  }

  // Construir el nombre base: todas las palabras excepto sexo, color y talle
  for (let i = 0; i < palabras.length; i++) {
    if (indiceColor >= 0 && (i === indiceColor || i === indiceColor + 1)) {
      continue;
    }
    if (i !== indiceSexo && i !== indiceColor && i !== indiceTalle) {
      const palabra = palabras[i];
      if (palabra) {
        nombrePartes.push(palabra);
      }
    }
  }

  const nombreBase = nombrePartes.join(' ').trim() || descripcion;

  return {
    skuBase: '',
    nombreBase,
    sexo,
    color,
    talle,
  };
}

