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

export type PrecioConfig = {
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
};

export interface PreciosDerivadosBase {
  precioTransfer: number;
  precioSinImp: number;
  cuotas: number;
}

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
 * Calcula precios derivados a partir del precio lista (transfer + sin imp + cuotas count).
 */
export function calcularTodosLosPrecios(
  precioLista: number,
  config?: PrecioConfig | number
): PreciosDerivadosBase {
  const cfgObj = typeof config === 'object' && config !== null ? config : undefined;
  const cuotasOverride = typeof config === 'number' ? config : cfgObj?.cuotasFinanciado;

  const descuento = cfgObj?.descuentoTransferencia ?? PRECIOS_DEFAULTS.DESCUENTO_TRANSFERENCIA;
  const iva = cfgObj?.iva ?? PRECIOS_DEFAULTS.IVA;
  const cuotas = cuotasOverride ?? PRECIOS_DEFAULTS.CUOTAS_FINANCIADO;

  const precioTransfer = calcularPrecioTransfer(precioLista, descuento);
  const precioSinImp = calcularPrecioSinImp(precioTransfer, iva);

  return {
    precioTransfer: Number(precioTransfer.toFixed(2)),
    precioSinImp: Number(precioSinImp.toFixed(2)),
    cuotas,
  };
}

/**
 * Calcula precios derivados usando override del producto o config de empresa
 */
export function calcularPreciosConJerarquia(
  precioLista: number,
  productoOverride: {
    descuentoTransferencia: number | null;
    iva: number | null;
    cuotasFinanciadoOverride: number | null;
  } | null,
  empresaConfig: PrecioConfig
): PreciosDerivadosBase {
  const descuento = productoOverride?.descuentoTransferencia ?? empresaConfig.descuentoTransferencia;
  const iva = productoOverride?.iva ?? empresaConfig.iva;
  const cuotas = productoOverride?.cuotasFinanciadoOverride ?? empresaConfig.cuotasFinanciado;

  const precioTransfer = calcularPrecioTransfer(precioLista, descuento);
  const precioSinImp = calcularPrecioSinImp(precioTransfer, iva);

  return {
    precioTransfer: Number(precioTransfer.toFixed(2)),
    precioSinImp: Number(precioSinImp.toFixed(2)),
    cuotas,
  };
}
