import type { PrecioConfig } from '../config/precios.config';
import {
  calcularPrecioSinImp,
  calcularPrecioTransfer,
  PRECIOS_DEFAULTS,
} from '../config/precios.config';

export interface PreciosDerivados {
  precioTransfer: number;
  precioSinImp: number;
  /** Cantidad de cuotas configurada (copy / preferencia MP), no monto por cuota. */
  cuotas: number;
}

export interface CalcPreciosDerivadosInput {
  precioLista: number;
  empresaConfig: PrecioConfig;
  cuotasOverride?: number;
  descuentoOverride?: number;
  ivaOverride?: number;
}

export function calcularPreciosDerivados(input: CalcPreciosDerivadosInput): PreciosDerivados {
  const descuento =
    input.descuentoOverride ?? input.empresaConfig.descuentoTransferencia;
  const iva = input.ivaOverride ?? input.empresaConfig.iva;
  const cuotas =
    input.cuotasOverride ?? input.empresaConfig.cuotasFinanciado;

  const precioTransfer = Number(
    calcularPrecioTransfer(input.precioLista, descuento).toFixed(2)
  );
  const precioSinImp = Number(calcularPrecioSinImp(precioTransfer, iva).toFixed(2));

  return {
    precioTransfer,
    precioSinImp,
    cuotas,
  };
}

/** @deprecated Usar calcularPreciosDerivados (sync, sin cotización MP). */
export async function calcularPreciosDerivadosCompletos(
  input: CalcPreciosDerivadosInput & { empresaId?: number }
): Promise<PreciosDerivados> {
  void input.empresaId;
  return calcularPreciosDerivados(input);
}

export interface PrecioPublicoDto {
  precioLista: number | null;
  precioTransfer: number | null;
  precioSinImp: number | null;
}

export function buildPrecioPublico(params: {
  precioLista: number | null;
  precioTransfer: number | null;
  precioSinImp: number | null;
}): PrecioPublicoDto {
  return {
    precioLista: params.precioLista,
    precioTransfer: params.precioTransfer,
    precioSinImp: params.precioSinImp,
  };
}

export type { PrecioConfig };
