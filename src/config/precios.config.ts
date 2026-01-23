/**
 * Configuración de cálculos de precios
 * Fuente de verdad para todos los cálculos de precios derivados
 */

// Descuento aplicado al precio lista para obtener precio transferencia
export const DESCUENTO_TRANSFERENCIA = 0.15; // 15% de descuento

// Factor de descuento (1 - descuento) para precio transferencia
export const FACTOR_TRANSFERENCIA = 1 - DESCUENTO_TRANSFERENCIA; // 0.85

// IVA (Impuesto al Valor Agregado)
export const IVA = 0.21; // 21%

// Factor para calcular precio sin impuestos (1 + IVA)
export const FACTOR_IVA = 1 + IVA; // 1.21

// Número de cuotas por defecto para precio financiado
export const CUOTAS_FINANCIADO_DEFAULT = 3;

/**
 * Calcula el precio de transferencia a partir del precio lista
 * Precio Transferencia = Precio Lista × (1 - DESCUENTO_TRANSFERENCIA)
 */
export function calcularPrecioTransfer(precioLista: number): number {
  return precioLista * FACTOR_TRANSFERENCIA;
}

/**
 * Calcula el precio sin impuestos a partir del precio transferencia
 * Precio Sin Impuestos = Precio Transferencia ÷ (1 + IVA)
 */
export function calcularPrecioSinImp(precioTransfer: number): number {
  return precioTransfer / FACTOR_IVA;
}

/**
 * Calcula el precio financiado (dividido en cuotas)
 * Precio Financiado = Precio Lista ÷ Número de Cuotas
 */
export function calcularPrecioFinanciado(
  precioLista: number,
  cuotas: number = CUOTAS_FINANCIADO_DEFAULT
): number {
  return precioLista / cuotas;
}

/**
 * Calcula todos los precios derivados a partir del precio lista
 */
export function calcularTodosLosPrecios(
  precioLista: number,
  cuotasFinanciado: number = CUOTAS_FINANCIADO_DEFAULT
): {
  precioTransfer: number;
  precioFinanciado: number;
  precioSinImp: number;
} {
  const precioTransfer = calcularPrecioTransfer(precioLista);
  const precioFinanciado = calcularPrecioFinanciado(precioLista, cuotasFinanciado);
  const precioSinImp = calcularPrecioSinImp(precioTransfer);

  return {
    precioTransfer: Number(precioTransfer.toFixed(2)),
    precioFinanciado: Number(precioFinanciado.toFixed(2)),
    precioSinImp: Number(precioSinImp.toFixed(2)),
  };
}

