import type {
  EmpresaInstallmentConfig,
  InstallmentQuote,
  InstallmentQuoteInput,
} from '../../types/installment.types';
import type { InstallmentProvider } from './installment-provider.interface';
import { mercadoPagoInstallmentProvider } from './mercadopago-installment.provider';
import { staticInstallmentProvider } from './static-installment.provider';

const providers: Record<string, InstallmentProvider> = {
  mercado_pago: mercadoPagoInstallmentProvider,
  static: staticInstallmentProvider,
};

export function registerInstallmentProvider(provider: InstallmentProvider): void {
  providers[provider.id] = provider;
}

export async function quoteInstallments(
  input: InstallmentQuoteInput
): Promise<InstallmentQuote | null> {
  const providerId = input.config.installmentProvider ?? 'static';
  const provider = providers[providerId] ?? staticInstallmentProvider;
  const quote = await provider.quote(input);
  if (quote) return quote;
  if (providerId !== 'static') {
    return staticInstallmentProvider.quote(input);
  }
  return null;
}

export function buildEmpresaInstallmentConfig(
  empresa: {
    id: number;
    cuotasFinanciado: number;
    installmentProvider?: string | null;
    installmentProviderOptions?: unknown;
  }
): EmpresaInstallmentConfig {
  const rawOpts = empresa.installmentProviderOptions;
  const providerOptions =
    rawOpts != null && typeof rawOpts === 'object' && !Array.isArray(rawOpts)
      ? (rawOpts as EmpresaInstallmentConfig['providerOptions'])
      : {};

  return {
    empresaId: empresa.id,
    cuotasFinanciado: empresa.cuotasFinanciado,
    installmentProvider: (empresa.installmentProvider?.trim() ||
      'mercado_pago') as EmpresaInstallmentConfig['installmentProvider'],
    providerOptions,
  };
}
