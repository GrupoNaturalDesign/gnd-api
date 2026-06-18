import type { InstallmentQuote, EmpresaInstallmentConfig } from '../types/installment.types';
import type { PrecioConfig } from '../config/precios.config';
import {
  calcularPrecioSinImp,
  calcularPrecioTransfer,
  PRECIOS_DEFAULTS,
} from '../config/precios.config';
import {
  buildEmpresaInstallmentConfig,
  quoteInstallments,
} from './installments';

export interface PreciosDerivadosCompletos {
  precioTransfer: number;
  precioFinanciado: number;
  precioSinImp: number;
  cuotas: number;
  cuotasSnapshot: InstallmentQuote | null;
}

export interface CalcPreciosDerivadosInput {
  precioLista: number;
  empresaId: number;
  empresaConfig: PrecioConfig & {
    installmentProvider?: string | null;
    installmentProviderOptions?: unknown;
  };
  cuotasOverride?: number;
  descuentoOverride?: number;
  ivaOverride?: number;
}

function isInstallmentQuote(value: unknown): value is InstallmentQuote {
  if (value == null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.cuotas === 'number' &&
    typeof o.montoCuota === 'number' &&
    typeof o.totalFinanciado === 'number'
  );
}

/** Reconstruye InstallmentQuote desde fila BD o fallback estático. */
export function installmentQuoteFromStorage(
  cuotasSnapshot: unknown,
  precioFinanciado: number | null | undefined,
  cuotasFinanciado: number | null | undefined,
  precioLista: number | null | undefined
): InstallmentQuote | null {
  if (isInstallmentQuote(cuotasSnapshot)) {
    return cuotasSnapshot;
  }
  const n = cuotasFinanciado ?? PRECIOS_DEFAULTS.CUOTAS_FINANCIADO;
  const montoCuota =
    precioFinanciado != null
      ? Number(precioFinanciado)
      : precioLista != null
        ? Number((precioLista / n).toFixed(2))
        : null;
  if (montoCuota == null) return null;
  const total = precioLista ?? montoCuota * n;
  return {
    provider: 'static',
    cuotas: n,
    montoCuota,
    totalFinanciado: Number(total.toFixed(2)),
    sinInteres: false,
    moneda: 'ARS',
    estimado: true,
  };
}

export function buildPrecioPublico(params: {
  precioLista: number | null;
  precioTransfer: number | null;
  precioSinImp: number | null;
  cuotasSnapshot: unknown;
  precioFinanciado: number | null;
  cuotasFinanciado: number | null;
}): {
  precioLista: number | null;
  precioTransfer: number | null;
  precioSinImp: number | null;
  precio3Cuotas: number | null;
  cuotas: InstallmentQuote | null;
} {
  const cuotas = installmentQuoteFromStorage(
    params.cuotasSnapshot,
    params.precioFinanciado,
    params.cuotasFinanciado,
    params.precioLista
  );
  return {
    precioLista: params.precioLista,
    precioTransfer: params.precioTransfer,
    precioSinImp: params.precioSinImp,
    precio3Cuotas: cuotas?.montoCuota ?? params.precioFinanciado,
    cuotas,
  };
}

export async function calcularPreciosDerivadosCompletos(
  input: CalcPreciosDerivadosInput
): Promise<PreciosDerivadosCompletos> {
  const descuento =
    input.descuentoOverride ?? input.empresaConfig.descuentoTransferencia;
  const iva = input.ivaOverride ?? input.empresaConfig.iva;
  const cuotas =
    input.cuotasOverride ?? input.empresaConfig.cuotasFinanciado;

  const precioTransfer = Number(
    calcularPrecioTransfer(input.precioLista, descuento).toFixed(2)
  );
  const precioSinImp = Number(calcularPrecioSinImp(precioTransfer, iva).toFixed(2));

  const installmentConfig: EmpresaInstallmentConfig = buildEmpresaInstallmentConfig({
    id: input.empresaId,
    cuotasFinanciado: cuotas,
    installmentProvider: input.empresaConfig.installmentProvider,
    installmentProviderOptions: input.empresaConfig.installmentProviderOptions,
  });

  const cuotasSnapshot = await quoteInstallments({
    empresaId: input.empresaId,
    monto: input.precioLista,
    cuotas,
    config: installmentConfig,
  });

  const precioFinanciado = cuotasSnapshot?.montoCuota ?? Number((input.precioLista / cuotas).toFixed(2));

  return {
    precioTransfer,
    precioFinanciado,
    precioSinImp,
    cuotas,
    cuotasSnapshot,
  };
}

// Re-export PrecioConfig for convenience in callers
export type { PrecioConfig };
