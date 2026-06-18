import { mercadoPagoClient } from '../mercadopago/mercadopago.client';
import { mercadoPagoConfig } from '../mercadopago/mercadopago.config';
import type { InstallmentQuote, InstallmentQuoteInput } from '../../types/installment.types';
import type { InstallmentProvider } from './installment-provider.interface';
import { parseCftTeaFromLabels } from './installment-labels.util';
import { staticInstallmentProvider } from './static-installment.provider';

const DEFAULT_PAYMENT_METHOD = 'visa';

function resolveMpOptions(input: InstallmentQuoteInput): {
  paymentMethodId: string;
  binReferencia?: string;
} {
  const mpOpts = input.config.providerOptions.mercado_pago;
  return {
    paymentMethodId:
      mpOpts?.paymentMethodId?.trim() ||
      process.env.MP_INSTALLMENT_PAYMENT_METHOD_ID?.trim() ||
      DEFAULT_PAYMENT_METHOD,
    binReferencia:
      mpOpts?.binReferencia?.trim() ||
      process.env.MP_INSTALLMENT_BIN_REFERENCIA?.trim() ||
      undefined,
  };
}

export class MercadoPagoInstallmentProvider implements InstallmentProvider {
  readonly id = 'mercado_pago';

  async quote(input: InstallmentQuoteInput): Promise<InstallmentQuote | null> {
    try {
      mercadoPagoConfig.assertConfigured();
    } catch {
      return staticInstallmentProvider.quote(input);
    }

    const { paymentMethodId, binReferencia } = resolveMpOptions(input);
    const amount = Number(input.monto.toFixed(2));

    try {
      const res = await mercadoPagoClient.getInstallments({
        amount,
        paymentMethodId,
        bin: binReferencia,
      });

      const payerCost = res.payer_costs?.find((pc) => pc.installments === input.cuotas);
      if (!payerCost) {
        return staticInstallmentProvider.quote(input);
      }

      const { cft, tea } = parseCftTeaFromLabels(payerCost.labels);
      const sinInteres =
        payerCost.installment_rate === 0 &&
        Math.abs(payerCost.total_amount - amount) < 0.02;

      return {
        provider: 'mercado_pago',
        cuotas: payerCost.installments,
        montoCuota: Number(payerCost.installment_amount.toFixed(2)),
        totalFinanciado: Number(payerCost.total_amount.toFixed(2)),
        sinInteres,
        moneda: 'ARS',
        cft,
        tea,
        referencia: binReferencia
          ? `${paymentMethodId}+${binReferencia}`
          : paymentMethodId,
        estimado: !binReferencia,
      };
    } catch {
      return staticInstallmentProvider.quote(input);
    }
  }
}

export const mercadoPagoInstallmentProvider = new MercadoPagoInstallmentProvider();
