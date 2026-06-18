import type { MercadoPagoCreatePreferenceBody } from '../services/mercadopago/mercadopago.types';

export type MpPricingMode = 'transfer' | 'financiado';

const MP_PRICING_MODES = new Set<MpPricingMode>(['transfer', 'financiado']);

export function parseMpPricingMode(raw: unknown): MpPricingMode | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim() as MpPricingMode;
  return MP_PRICING_MODES.has(v) ? v : null;
}

export function assertMpPricingMode(raw: unknown): MpPricingMode {
  const mode = parseMpPricingMode(raw);
  if (!mode) {
    throw new Error('mpPricingMode inválido: debe ser "transfer" o "financiado".');
  }
  return mode;
}

/** Preferencia MP según modo de precio del checkout. */
export function buildMercadoPagoPaymentMethodsForMode(
  mpPricingMode: MpPricingMode,
  cuotasFinanciado: number
): MercadoPagoCreatePreferenceBody['payment_methods'] {
  if (mpPricingMode === 'transfer') {
    return {
      installments: 1,
      excluded_payment_types: [{ id: 'credit_card' }],
    };
  }

  const n = Math.max(1, Math.trunc(cuotasFinanciado));
  if (n === 1) {
    return {
      installments: 1,
      excluded_payment_types: [{ id: 'bank_transfer' }],
    };
  }
  return {
    default_installments: n,
    installments: n,
    excluded_payment_types: [{ id: 'bank_transfer' }],
  };
}

export function expectedUnitPriceForMpMode(
  precioLista: number,
  precioTransfer: number | null | undefined,
  mpPricingMode: MpPricingMode
): number {
  if (mpPricingMode === 'financiado') {
    return precioLista;
  }
  const t = precioTransfer != null ? Number(precioTransfer) : NaN;
  if (Number.isFinite(t) && t > 0) return t;
  return precioLista;
}

export function unitPriceMatchesMpMode(
  clientPrice: number,
  precioLista: number,
  precioTransfer: number | null | undefined,
  mpPricingMode: MpPricingMode,
  tolerance = 0.05
): boolean {
  const expected = expectedUnitPriceForMpMode(precioLista, precioTransfer, mpPricingMode);
  return Math.abs(clientPrice - expected) <= tolerance;
}
