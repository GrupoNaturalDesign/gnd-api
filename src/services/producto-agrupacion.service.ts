import type { SFactoryProduct } from '../types/sfactory.types';
import {
  construirNombreBase,
  extraerColorDesdePalabras,
  extraerSexoDesdePalabras,
  extraerTalleDesdePalabras,
  indicesDesdeParseo,
  limpiarSufijoGeneroSuelto,
  resolverUnisexFinal,
} from '../utils/variantes-parse.utils';
import {
  extraerNucleoYSexoDesdeCodigo,
  resolverClaveGrupoFusion,
  resolverColorVariante,
} from '../utils/sku-line-fusion.utils';

export function elegirNombreBase(actual: string, nuevo: string): string {
  const a = actual.trim();
  const n = nuevo.trim();
  if (!a) return n;
  if (!n) return a;
  return n.length < a.length ? n : a;
}

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
 * Resuelve clave de agrupación sin duplicar sufijo de sexo (ej. L-WW-CAM-WR_H + H → WR_H_H).
 */
export function resolverClaveAgrupacion(
  codigo: string,
  sexoNormalizado: string | null
): { claveGrupo: string; codigoBaseSinSufijo: string } {
  const { nucleo: codigoBaseSinSufijo, sexoDesdeCodigo } =
    extraerNucleoYSexoDesdeCodigo(codigo);

  const sexoFinal = sexoNormalizado ?? sexoDesdeCodigo;
  const sufijoSexo =
    sexoFinal === 'Masculino' ? 'H' : sexoFinal === 'Femenino' ? 'D' : 'U';
  const claveGrupo = `${codigoBaseSinSufijo}_${sufijoSexo}`;

  return { claveGrupo, codigoBaseSinSufijo };
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

  if (codigo) {
    const codigoRegex = new RegExp(`^${codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
    nombreLimpio = nombreLimpio.replace(codigoRegex, '').trim();
  }

  nombreLimpio = nombreLimpio.replace(/^\d+\s*-\s*/i, '').trim();

  let rubroDelCodigo: string | null = null;
  if (codigo) {
    const partesCodigo = codigo.split('-');
    const rubrosCodigo: Record<string, string> = {
      CAM: 'Camisa',
      PAN: 'Pantalón',
      REM: 'Remera',
      BUZ: 'Buzo',
      CHA: 'Chaqueta',
      SHO: 'Short',
      BER: 'Bermuda',
      VES: 'Vestido',
      FAL: 'Falda',
      SAC: 'Saco',
      ABR: 'Abrigo',
      SWE: 'Sweater',
      POL: 'Polo',
      CHI: 'Chomba',
      JEA: 'Jean',
      JOG: 'Jogging',
    };

    for (const parte of partesCodigo) {
      const parteUpper = parte.toUpperCase();
      if (rubrosCodigo[parteUpper]) {
        rubroDelCodigo = rubrosCodigo[parteUpper];
        break;
      }
    }
  }

  const palabras = nombreLimpio.split(/\s+/).filter(Boolean);

  let { sexoRaw, indiceSexo } = extraerSexoDesdePalabras(palabras, nombreLimpio);

  const excluirParaTalle = new Set<number>();
  if (indiceSexo >= 0) excluirParaTalle.add(indiceSexo);

  let { talle, indiceTalle } = extraerTalleDesdePalabras(palabras, excluirParaTalle);
  const unisexRes = resolverUnisexFinal(palabras, sexoRaw, indiceTalle);
  sexoRaw = unisexRes.sexoRaw;
  if (unisexRes.talle) {
    talle = unisexRes.talle;
    indiceTalle = unisexRes.indiceTalle;
  } else if (unisexRes.indiceTalle === -1 && indiceTalle >= 0 && palabras[indiceTalle]?.toUpperCase() === 'UNISEX') {
    indiceTalle = -1;
  }

  const excluirParaColor = new Set<number>();
  if (indiceSexo >= 0) excluirParaColor.add(indiceSexo);
  if (indiceTalle >= 0) excluirParaColor.add(indiceTalle);

  const { color, indiceInicio: indiceColorInicio, longitudPalabras: colorLongitud } =
    extraerColorDesdePalabras(palabras, excluirParaColor);

  const indices = indicesDesdeParseo(indiceSexo, indiceColorInicio, colorLongitud, indiceTalle);
  let nombreBase = construirNombreBase(palabras, indices) || nombreLimpio;
  
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
  
  const sexoNormalizado = sexoRaw ? normalizarSexo(sexoRaw) : null;
  nombreBase = limpiarSufijoGeneroSuelto(nombreBase, sexoNormalizado);

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
    
    // Extraer número de variante del SKU (solo para ordenamiento)
    const numeroVariante = extraerNumeroVariante(codigo);

    // Parsear nombre del producto removiendo código SKU si está presente
    const descripcion = (producto as any).Descripcion || (producto as any).descripcion || codigo;
    const parseado = parsearNombreProducto(descripcion, codigo);

    // Normalizar nombre base para comparación
    const nombreBaseNormalizado = normalizarNombre(parseado.nombreBase || descripcion);

    // Sexo ya viene normalizado del parseo (Masculino/Femenino/Unisex)
    const sexoNormalizado = parseado.sexo;

    const { claveGrupo, colorDesdeSku } = resolverClaveGrupoFusion(
      codigo,
      sexoNormalizado
    );

    const colorCampo = (producto as any).Color || (producto as any).color || null;
    const color = resolverColorVariante(
      parseado.color,
      colorCampo,
      codigo
    ) ?? colorDesdeSku;
    const talle =
      parseado.talle ||
      (producto as any).Talle ||
      (producto as any).talle ||
      null;
    
    // Obtener o crear grupo
    if (!grupos.has(claveGrupo)) {
      const nuevoGrupo: ProductoAgrupado = {
        codigoAgrupacion: claveGrupo,
        codigoBase: claveGrupo,
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
    
    if (parseado.nombreBase) {
      const elegido = elegirNombreBase(grupo.nombreBase, parseado.nombreBase);
      if (elegido !== grupo.nombreBase) {
        grupo.nombreBase = elegido;
        grupo.nombreBaseNormalizado = normalizarNombre(elegido);
      }
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
      const ordenLetras = [
        '2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'UNISEX',
      ];
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

