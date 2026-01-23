import type { SFactoryProduct } from '../types/sfactory.types';

/**
 * Extrae la base del SKU removiendo el número final
 * Ejemplo: L-WW-CAM-WR1 -> L-WW-CAM-WR
 *          L-WW-CAM-WR10 -> L-WW-CAM-WR
 */
export function extraerBaseSKU(codigo: string): string {
  if (!codigo) return codigo;
  
  // Patrón: buscar el último número al final del código
  // Ejemplo: L-WW-CAM-WR1 -> L-WW-CAM-WR
  //          L-WW-CAM-WR10 -> L-WW-CAM-WR
  const match = codigo.match(/^(.+?)(\d+)$/);
  if (match && match[1]) {
    return match[1]; // Retornar la parte sin el número
  }
  
  // Si no hay número al final, retornar el código completo
  return codigo;
}

/**
 * Extrae el código base de agrupación removiendo números finales
 * Esta es la función principal para agrupar productos por SKU base
 * Ejemplo: "L-WW-CAM-WR1" -> "L-WW-CAM-WR"
 *          "L-WW-CAM-WR10" -> "L-WW-CAM-WR"
 */
export function extraerCodigoAgrupacion(codigo: string): string {
  return extraerBaseSKU(codigo);
}

/**
 * Normaliza el sexo a valores estándar: Masculino, Femenino, Unisex
 * Mapea: M, Masculino, Hombre -> Masculino
 *        F, Femenino, Mujer, Dama, Damas -> Femenino
 *        Unisex, Uni -> Unisex
 */
export function normalizarSexo(sexo: string | null | undefined): string | null {
  if (!sexo) return null;
  
  const sexoLower = sexo.toLowerCase().trim();
  
  // Masculino
  if (sexoLower === 'm' || sexoLower === 'masculino' || sexoLower === 'hombre') {
    return 'Masculino';
  }
  
  // Femenino
  if (sexoLower === 'f' || sexoLower === 'femenino' || sexoLower === 'mujer' || 
      sexoLower === 'dama' || sexoLower === 'damas') {
    return 'Femenino';
  }
  
  // Unisex
  if (sexoLower === 'unisex' || sexoLower === 'uni') {
    return 'Unisex';
  }
  
  // Si no coincide con ninguno conocido, capitalizar primera letra
  return sexo.charAt(0).toUpperCase() + sexo.slice(1).toLowerCase();
}

/**
 * Normaliza rubro/subrubro a mayúsculas
 * Ejemplo: "camisa" -> "CAMISA"
 *          "pantalon" -> "PANTALON"
 */
export function normalizarRubro(rubro: string | null | undefined): string | null {
  if (!rubro) return null;
  return rubro.toUpperCase().trim();
}

/**
 * Extrae el número de variante del SKU
 * Ejemplo: L-WW-CAM-WR1 -> 1
 *          L-WW-CAM-WR10 -> 10
 */
export function extraerNumeroVariante(codigo: string): number | null {
  if (!codigo) return null;
  
  const match = codigo.match(/(\d+)$/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  
  return null;
}

/**
 * Parsea el nombre del producto para extraer nombre base, color y talle
 * Ejemplo: "Camisa Wrench Hombre Cemento 32" -> 
 *   { nombreBase: "Camisa Wrench", sexo: "Hombre", color: "Cemento", talle: "32" }
 */
export interface ProductoParseado {
  nombreBase: string;
  sexo: string | null;
  color: string | null;
  talle: string | null;
}

/**
 * Parsea el nombre del producto removiendo código SKU si está al inicio
 * Ejemplo: "50039600 - Pantalón cargo Masculino" -> nombreBase: "Pantalón cargo", sexo: "Masculino"
 * 
 * @param descripcion Descripción del producto
 * @param codigo Código SKU opcional para remover del inicio si está presente
 */
export function parsearNombreProducto(descripcion: string, codigo?: string): ProductoParseado {
  if (!descripcion) {
    return {
      nombreBase: '',
      sexo: null,
      color: null,
      talle: null,
    };
  }

  let nombreLimpio = descripcion.trim();
  
  // Remover código SKU del inicio si está presente
  // Patrón: "50039600 - " o "50039600 -" o similar
  if (codigo) {
    const codigoRegex = new RegExp(`^${codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
    nombreLimpio = nombreLimpio.replace(codigoRegex, '').trim();
  }
  
  // También remover patrón genérico de código al inicio: "NUMBER - "
  nombreLimpio = nombreLimpio.replace(/^\d+\s*-\s*/i, '').trim();
  
  // MEJORA: Extraer información del código si está disponible
  // Ejemplo: "L-WW-CAM-DR31" -> "CAM" podría indicar "Camisa"
  let rubroDelCodigo: string | null = null;
  if (codigo) {
    const partesCodigo = codigo.split('-');
    // Buscar abreviaciones comunes de rubros en el código
    const rubrosCodigo: Record<string, string> = {
      'CAM': 'Camisa',
      'PAN': 'Pantalón',
      'REM': 'Remera',
      'BUZ': 'Buzo',
      'CHA': 'Chaqueta',
      'SHO': 'Short',
      'BER': 'Bermuda',
      'VES': 'Vestido',
      'FAL': 'Falda',
      'SAC': 'Saco',
      'ABR': 'Abrigo',
      'SWE': 'Sweater',
      'POL': 'Polo',
      'CHI': 'Chomba',
      'JEA': 'Jean',
      'JOG': 'Jogging',
    };
    
    for (const parte of partesCodigo) {
      const parteUpper = parte.toUpperCase();
      if (rubrosCodigo[parteUpper]) {
        rubroDelCodigo = rubrosCodigo[parteUpper];
        break;
      }
    }
  }
  
  // Mapeo de palabras de sexo (ORDEN IMPORTANTE: más específicas primero)
  const palabrasSexo = [
    'masculino', 'femenino', 'unisex', // Completas primero
    'hombre', 'mujer', 'dama', 'damas', 
    'niño', 'niña',
    'm', 'f', 'uni'
  ];
  
  const palabras = nombreLimpio.split(/\s+/);
  
  let sexo: string | null = null;
  let talle: string | null = null;
  let color: string | null = null;
  const nombrePartes: string[] = [];
  
  // MEJORA: Buscar sexo de forma más precisa
  // Priorizar palabras completas sobre abreviaciones
  let indiceSexo = -1;
  
  // Primero buscar palabras completas de sexo (más específicas primero)
  for (let i = 0; i < palabras.length; i++) {
    const palabra = palabras[i];
    if (!palabra) continue;
    const palabraLower = palabra.toLowerCase().trim();
    
    // Buscar coincidencia exacta (case insensitive)
    const sexoEncontrado = palabrasSexo.find(s => 
      palabraLower === s.toLowerCase()
    );
    
    if (sexoEncontrado) {
      sexo = normalizarSexo(palabra);
      indiceSexo = i;
      break;
    }
  }
  
  // Si no encontramos sexo completo, buscar abreviaciones
  if (!sexo) {
    for (let i = 0; i < palabras.length; i++) {
      const palabra = palabras[i];
      if (!palabra) continue;
      const palabraUpper = palabra.toUpperCase().trim();
      
      if (palabraUpper === 'H' && !/\bHOMBRE\b/i.test(nombreLimpio)) {
        sexo = 'Masculino';
        indiceSexo = i;
        break;
      }
      if (palabraUpper === 'D' && !/\bDAMA\b/i.test(nombreLimpio)) {
        sexo = 'Femenino';
        indiceSexo = i;
        break;
      }
    }
  }
  
  // Lista de colores comunes (incluyendo compuestos)
  // IMPORTANTE: Los colores compuestos (2 palabras) deben ir ANTES de los simples
  // para que tengan prioridad en la detección (ej: "gris topo" antes de "gris")
  const colores = [
    // Colores compuestos (2 palabras) - ORDEN IMPORTANTE
    'azul marino', 'azulmarino', 'azul mar',
    'gris melange', 'grismelange', 'gris melange',
    'gris topo', 'gristopo', 'gris topo',
    'gris perla', 'grisperla',
    'lavado oscuro', 'lavadooscuro', 'lavado oscuro',
    'lavado claro', 'lavadoclaro', 'lavado claro',
    'lavado medio', 'lavadomedio', 'lavado medio',
    // Colores simples (1 palabra)
    'arena',
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
    'marron', 'marrón',
    'tostado',
    'cemento',
    'celeste',
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
  
  // Buscar color (generalmente antes del talle o después del sexo)
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
    // Buscar en toda la descripción, priorizando palabras después del sexo y antes del talle
    for (let i = 0; i < palabras.length; i++) {
      if (i === indiceSexo || i === indiceTalle) continue; // Saltar sexo y talle
      const palabra = palabras[i];
      if (!palabra) continue;
      const palabraLower = palabra.toLowerCase();
      
      // Buscar coincidencia exacta primero (prioridad a 'negro')
      const colorExacto = colores.find(c => palabraLower === c || palabraLower === c.replace(/\s+/g, ''));
      if (colorExacto) {
        color = palabra; // Mantener capitalización original
        indiceColor = i;
        break;
      }
      
      // Buscar coincidencia parcial
      const colorParcial = colores.find(c => 
        palabraLower.includes(c) || 
        c.includes(palabraLower) ||
        palabraLower.replace(/\s+/g, '') === c.replace(/\s+/g, '')
      );
      if (colorParcial) {
        color = palabra; // Mantener capitalización original
        indiceColor = i;
        break;
      }
    }
  }
  
  // Construir el nombre base: todas las palabras excepto sexo, color y talle
  for (let i = 0; i < palabras.length; i++) {
    // Si es color compuesto, saltar ambas palabras
    if (indiceColor >= 0 && (i === indiceColor || i === indiceColor + 1)) {
      continue;
    }
    // Saltar sexo, color simple y talle
    if (i !== indiceSexo && i !== indiceColor && i !== indiceTalle) {
      const palabra = palabras[i];
      if (palabra) {
        nombrePartes.push(palabra);
      }
    }
  }
  
  let nombreBase = nombrePartes.join(' ').trim() || nombreLimpio;
  
  // MEJORA: Si tenemos rubro del código y no está en el nombre, agregarlo al inicio
  if (rubroDelCodigo) {
    const nombreLower = nombreBase.toLowerCase();
    const rubroLower = rubroDelCodigo.toLowerCase();
    
    // Verificar si alguna palabra del nombre coincide con el rubro
    const nombreTieneRubro = palabras.some(p => 
      p && p.toLowerCase().includes(rubroLower) || rubroLower.includes(p.toLowerCase())
    );
    
    if (!nombreTieneRubro) {
      // El rubro del código debería estar al inicio del nombre base
      nombreBase = `${rubroDelCodigo} ${nombreBase}`.trim();
    } else {
      // Si el rubro está en el nombre pero al final, reordenarlo al inicio
      // Ejemplo: "Drill Camisa" -> "Camisa Drill"
      const palabrasNombre = nombreBase.split(/\s+/);
      const indiceRubroEnNombre = palabrasNombre.findIndex(p => 
        p.toLowerCase().includes(rubroLower) || rubroLower.includes(p.toLowerCase())
      );
      
      if (indiceRubroEnNombre > 0 && indiceRubroEnNombre === palabrasNombre.length - 1) {
        // El rubro está al final, moverlo al inicio
        const palabrasSinRubro = palabrasNombre.filter((_, i) => i !== indiceRubroEnNombre);
        nombreBase = `${rubroDelCodigo} ${palabrasSinRubro.join(' ')}`.trim();
      } else if (indiceRubroEnNombre > 0) {
        // El rubro está en el medio, moverlo al inicio
        const palabrasSinRubro = palabrasNombre.filter((_, i) => i !== indiceRubroEnNombre);
        nombreBase = `${rubroDelCodigo} ${palabrasSinRubro.join(' ')}`.trim();
      }
    }
  }
  
  // Normalizar sexo antes de retornar
  const sexoNormalizado = sexo ? normalizarSexo(sexo) : null;
  
  return {
    nombreBase: nombreBase || nombreLimpio,
    sexo: sexoNormalizado,
    color,
    talle,
  };
}

/**
 * Normaliza un nombre para comparación (sin acentos, lowercase, sin espacios extra)
 */
function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Agrupa productos de SFactory por código base del SKU
 * Ejemplo: "L-WW-CAM-WR1", "L-WW-CAM-WR2", "L-WW-CAM-WR3" -> todos se agrupan bajo "L-WW-CAM-WR"
 * Esto permite que productos con el mismo código base (misma línea) se agrupen correctamente
 * Retorna un mapa donde la clave es el código base del SKU
 */
export interface ProductoAgrupado {
  codigoAgrupacion: string; // Código base del SKU (ej: "L-WW-CAM-WR")
  codigoBase: string; // Mismo que codigoAgrupacion (alias para claridad)
  nombreBase: string; // Nombre sin color ni talle (ej: "Camisa Wrench")
  nombreBaseNormalizado: string; // Nombre normalizado para comparación
  sexo: string | null; // Normalizado: Masculino, Femenino, Unisex
  productos: Array<{
    producto: SFactoryProduct;
    numeroVariante: number | null;
    color: string | null;
    talle: string | null;
  }>;
  colores: string[];
  talles: string[];
}

/**
 * Agrupa productos por código base del SKU en lugar de por nombre
 * Esto es más preciso ya que productos con el mismo código base son la misma línea
 */
export function agruparProductosPorCodigoBase(productos: SFactoryProduct[]): Map<string, ProductoAgrupado> {
  const grupos = new Map<string, ProductoAgrupado>();
  
  for (const producto of productos) {
    const codigo = (producto as any).Codigo || (producto as any).codigo || '';
    if (!codigo) continue;
    
    // Extraer código base para agrupación (ej: "L-WW-CAM-WR1" -> "L-WW-CAM-WR")
    const codigoBase = extraerCodigoAgrupacion(codigo);
    
    // Extraer número de variante del SKU (solo para ordenamiento)
    const numeroVariante = extraerNumeroVariante(codigo);
    
    // Parsear nombre del producto removiendo código SKU si está presente
    const descripcion = (producto as any).Descripcion || (producto as any).descripcion || codigo;
    const parseado = parsearNombreProducto(descripcion, codigo);
    
    // Normalizar nombre base para comparación
    const nombreBaseNormalizado = normalizarNombre(parseado.nombreBase || descripcion);
    
    // Sexo ya viene normalizado del parseo (Masculino/Femenino/Unisex)
    const sexoNormalizado = parseado.sexo;
    
    // Usar color del parseo o de los campos directos (priorizar campos directos si el parseo falló)
    // Los campos directos pueden tener el color completo sin parsear
    let color = (producto as any).Color || (producto as any).color || null;
    if (!color) {
      // Si no hay color en campos directos, usar el parseado
      color = parseado.color;
    } else {
      // Normalizar el color de campos directos (capitalizar primera letra de cada palabra)
      const palabrasColor = color.split(/\s+/).map((p: string) => 
        p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      );
      color = palabrasColor.join(' ');
    }
    const talle = parseado.talle || 
                  (producto as any).Talle || 
                  (producto as any).talle || 
                  null;
    
    // Clave de grupo: código base del SKU
    // Esto asegura que todos los productos con el mismo código base se agrupen
    const claveGrupo = codigoBase;
    
    // Obtener o crear grupo
    if (!grupos.has(claveGrupo)) {
      const nuevoGrupo: ProductoAgrupado = {
        codigoAgrupacion: codigoBase, // Usar código base como código de agrupación
        codigoBase: codigoBase,
        nombreBase: parseado.nombreBase || descripcion,
        nombreBaseNormalizado,
        sexo: sexoNormalizado,
        productos: [],
        colores: [],
        talles: [],
      };
      grupos.set(claveGrupo, nuevoGrupo);
    }
    
    const grupo = grupos.get(claveGrupo)!;
    
    // Actualizar nombre base si el nuevo es más completo
    if (parseado.nombreBase && parseado.nombreBase.length > grupo.nombreBase.length) {
      grupo.nombreBase = parseado.nombreBase;
      grupo.nombreBaseNormalizado = nombreBaseNormalizado;
    }
    
    // Actualizar sexo si tenemos uno y no había antes
    if (!grupo.sexo && sexoNormalizado) {
      grupo.sexo = sexoNormalizado;
    }
    
    // Agregar producto al grupo
    grupo.productos.push({
      producto,
      numeroVariante,
      color,
      talle,
    });
    
    // Agregar color único (comparar normalizados para evitar duplicados)
    if (color) {
      const colorNormalizado = normalizarNombre(color);
      const colorYaExiste = grupo.colores.some(c => normalizarNombre(c) === colorNormalizado);
      if (!colorYaExiste) {
        grupo.colores.push(color);
      }
    }
    
    // Agregar talle único
    if (talle && !grupo.talles.includes(talle)) {
      grupo.talles.push(talle);
    }
  }
  
  // Ordenar productos dentro de cada grupo por número de variante
  grupos.forEach((grupo) => {
    grupo.productos.sort((a, b) => {
      const numA = a.numeroVariante || 0;
      const numB = b.numeroVariante || 0;
      return numA - numB;
    });
    
    // Ordenar colores alfabéticamente
    grupo.colores.sort((a, b) => normalizarNombre(a).localeCompare(normalizarNombre(b)));
    
    // Ordenar talles
    grupo.talles.sort((a, b) => {
      // Ordenar talles numéricos primero
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      // Luego talles de letras
      const ordenLetras = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'XXL', 'XXXL'];
      const idxA = ordenLetras.indexOf(a.toUpperCase());
      const idxB = ordenLetras.indexOf(b.toUpperCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  });
  
  return grupos;
}

/**
 * @deprecated Usar agruparProductosPorCodigoBase en su lugar
 * Esta función se mantiene para compatibilidad pero usa agrupación por nombre
 */
export function agruparProductosPorSKU(productos: SFactoryProduct[]): Map<string, ProductoAgrupado> {
  // Para compatibilidad, usar agrupación por código base
  return agruparProductosPorCodigoBase(productos);
}

