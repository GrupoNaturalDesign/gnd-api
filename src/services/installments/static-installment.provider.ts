import type { InstallmentQuote, InstallmentQuoteInput } from '../../types/installment.types';
import type { InstallmentProvider } from './installment-provider.interface';

export class StaticInstallmentProvider implements InstallmentProvider {
  readonly id = 'static';

  quote(input: InstallmentQuoteInput): Promise<InstallmentQuote | null> {
    const { monto, cuotas } = input;
    if (!Number.isFinite(monto) || monto <= 0 || !Number.isFinite(cuotas) || cuotas < 1) {
      return Promise.resolve(null);
    }
    const montoCuota = Number((monto / cuotas).toFixed(2));
    return Promise.resolve({
      provider: 'static',
      cuotas,
      montoCuota,
      totalFinanciado: Number(monto.toFixed(2)),
      sinInteres: false,
      moneda: 'ARS',
      cft: null,
      tea: null,
      referencia: 'división simple (estimado)',
      estimado: true,
    });
  }
}

export const staticInstallmentProvider = new StaticInstallmentProvider();
