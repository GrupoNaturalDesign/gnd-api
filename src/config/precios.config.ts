/**
 * Configuración de cálculos de precios
 * Fuente de verdad para todos los cálculos de precios derivados
 * 
 * Valores por defecto (se usan si no se pasa config personalizada)
 */

export const PRECIOS_DEFAULTS = {
  DESCUENTO_TRANSFERENCIA: 0.15, // 15% de descuento
  IVA: 0.21, // 21%
  CUOTAS_FINANCIADO: 3,
} as const;

/**
 * Alias retrocompatible para el valor por defecto de cuotas financiadas.
 * Preferir `PRECIOS_DEFAULTS.CUOTAS_FINANCIADO` en código nuevo.
 */
export const CUOTAS_FINANCIADO_DEFAULT = PRECIOS_DEFAULTS.CUOTAS_FINANCIADO;

// Tipos exportados para usar en otros lugares
export type PrecioConfig = {
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
};

/**
 * Calcula el precio de transferencia a partir del precio lista
 * Precio Transferencia = Precio Lista × (1 - descuento)
 */
export function calcularPrecioTransfer(
  precioLista: number,
  descuento: number = PRECIOS_DEFAULTS.DESCUENTO_TRANSFERENCIA
): number {
  return precioLista * (1 - descuento);
}

/**
 * Calcula el precio sin impuestos a partir del precio transferencia
 * Precio Sin Impuestos = Precio Transferencia ÷ (1 + IVA)
 */
export function calcularPrecioSinImp(
  precioTransfer: number,
  iva: number = PRECIOS_DEFAULTS.IVA
): number {
  return precioTransfer / (1 + iva);
}

/**
 * Calcula el precio financiado (dividido en cuotas)
 * Precio Financiado = Precio Lista ÷ Número de Cuotas
 */
export function calcularPrecioFinanciado(
  precioLista: number,
  cuotas: number = PRECIOS_DEFAULTS.CUOTAS_FINANCIADO
): number {
  return precioLista / cuotas;
}

/**
 * Calcula todos los precios derivados a partir del precio lista
 * @param precioLista - Precio base
 * @param config - `PrecioConfig` (descuento, iva, cuotas) o un `number` con cuotas (compat). Si no se pasa, usa defaults.
 */
export function calcularTodosLosPrecios(
  precioLista: number,
  config?: PrecioConfig | number
): {
  precioTransfer: number;
  precioFinanciado: number;
  precioSinImp: number;
  cuotas: number;
} {
  const cfgObj = typeof config === 'object' && config !== null ? config : undefined;
  const cuotasOverride = typeof config === 'number' ? config : cfgObj?.cuotasFinanciado;

  const descuento = cfgObj?.descuentoTransferencia ?? PRECIOS_DEFAULTS.DESCUENTO_TRANSFERENCIA;
  const iva = cfgObj?.iva ?? PRECIOS_DEFAULTS.IVA;
  const cuotas = cuotasOverride ?? PRECIOS_DEFAULTS.CUOTAS_FINANCIADO;

  const precioTransfer = calcularPrecioTransfer(precioLista, descuento);
  const precioFinanciado = calcularPrecioFinanciado(precioLista, cuotas);
  const precioSinImp = calcularPrecioSinImp(precioTransfer, iva);

  return {
    precioTransfer: Number(precioTransfer.toFixed(2)),
    precioFinanciado: Number(precioFinanciado.toFixed(2)),
    precioSinImp: Number(precioSinImp.toFixed(2)),
    cuotas,
  };
}

/**
 * Calcula precios derivados usando override del producto o config de empresa
 * @param precioLista - Precio base
 * @param productoOverride - Override del producto (puede ser null)
 * @param empresaConfig - Config de la empresa (fallback)
 */
export function calcularPreciosConJerarquia(
  precioLista: number,
  productoOverride: { descuentoTransferencia: number | null; iva: number | null; cuotasFinanciadoOverride: number | null } | null,
  empresaConfig: PrecioConfig
): {
  precioTransfer: number;
  precioFinanciado: number;
  precioSinImp: number;
  cuotas: number;
} {
  const descuento = productoOverride?.descuentoTransferencia ?? empresaConfig.descuentoTransferencia;
  const iva = productoOverride?.iva ?? empresaConfig.iva;
  const cuotas = productoOverride?.cuotasFinanciadoOverride ?? empresaConfig.cuotasFinanciado;

  const precioTransfer = calcularPrecioTransfer(precioLista, descuento);
  const precioFinanciado = calcularPrecioFinanciado(precioLista, cuotas);
  const precioSinImp = calcularPrecioSinImp(precioTransfer, iva);

  return {
    precioTransfer: Number(precioTransfer.toFixed(2)),
    precioFinanciado: Number(precioFinanciado.toFixed(2)),
    precioSinImp: Number(precioSinImp.toFixed(2)),
    cuotas,
  };
}