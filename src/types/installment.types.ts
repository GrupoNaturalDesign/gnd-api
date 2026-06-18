/**
 * Modelo de dominio agnóstico de proveedor para cotización de cuotas.
 */

export type InstallmentProviderId = 'mercado_pago' | 'static' | (string & {});

export interface InstallmentQuote {
  provider: InstallmentProviderId;
  cuotas: number;
  montoCuota: number;
  totalFinanciado: number;
  sinInteres: boolean;
  moneda: 'ARS';
  cft?: string | null;
  tea?: string | null;
  referencia?: string | null;
  estimado?: boolean;
}

export interface InstallmentProviderOptions {
  mercado_pago?: {
    paymentMethodId?: string;
    binReferencia?: string;
  };
}

export interface EmpresaInstallmentConfig {
  empresaId: number;
  cuotasFinanciado: number;
  installmentProvider: InstallmentProviderId;
  providerOptions: InstallmentProviderOptions;
}

export interface InstallmentQuoteInput {
  empresaId: number;
  monto: number;
  cuotas: number;
  config: EmpresaInstallmentConfig;
}

/** Precio público unificado para la tienda. */
export interface PrecioPublico {
  precioLista: number | null;
  precioTransfer: number | null;
  precioSinImp: number | null;
  /** @deprecated usar cuotas.montoCuota */
  precio3Cuotas: number | null;
  cuotas: InstallmentQuote | null;
}
