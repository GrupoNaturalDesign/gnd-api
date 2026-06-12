import { FormaEnvio, Prisma } from '@prisma/client';
import { shippingService } from './shipping/shipping.service';
import type { ShippingDeliveryType, ShippingParcel, ShippingProviderName } from './shipping/shipping.types';
import { ShippingValidationError } from './shipping/shipping.errors';
import type { CorreoShippingQuote } from './shipping/correo/correo.types';
import {
  buildParcelFromCheckoutItems,
  type CheckoutShippingItemInput,
} from '../utils/shipping-parcel.util';

/** Diferencia máxima aceptada entre monto cotizado en cliente vs re-cotización en servidor (ARS). */
export const CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS = 2.5;

export interface CheckoutEnvioClientPayload {
  provider: ShippingProviderName;
  deliveryType: ShippingDeliveryType;
  /** Calculado en servidor; el cliente puede enviar el de la última cotización (se revalida). */
  parcel?: ShippingParcel;
  cpDestino: string;
  clientQuotedAmount: number;
  /** MiCorreo: código de producto (p. ej. CP, EP). Obligatorio si el monto no es el mínimo. */
  correoProductType?: string;
  agencyId?: string;
  agencyLabel?: string;
  address?: {
    streetName: string;
    streetNumber: string;
    city: string;
    state: string;
    zipCode: string;
    floor?: string;
    department?: string;
  };
}

export type { CheckoutShippingItemInput };

export function mapFormaEnvioCheckout(
  provider: ShippingProviderName,
  deliveryType: ShippingDeliveryType
): FormaEnvio {
  if (provider === 'andreani') {
    return deliveryType === 'homeDelivery'
      ? FormaEnvio.andreani_domicilio
      : FormaEnvio.andreani_sucursal;
  }
  return deliveryType === 'homeDelivery'
    ? FormaEnvio.correo_domicilio
    : FormaEnvio.correo_sucursal;
}

function minCorreoPrice(quotes: CorreoShippingQuote[]): number {
  if (quotes.length === 0) {
    throw new ShippingValidationError('MiCorreo no devolvió tarifas');
  }
  return Math.min(...quotes.map((q) => q.price));
}

function normalizeCorreoProductKey(s: string): string {
  return s.trim().toUpperCase();
}

function pickCorreoPrice(
  quotes: CorreoShippingQuote[],
  correoProductType?: string
): number {
  if (quotes.length === 0) {
    throw new ShippingValidationError('MiCorreo no devolvió tarifas');
  }
  const key = correoProductType?.trim();
  if (!key) {
    return minCorreoPrice(quotes);
  }
  const want = normalizeCorreoProductKey(key);
  const found = quotes.find((q) => {
    const code = q.serviceCode?.trim();
    return code != null && normalizeCorreoProductKey(code) === want;
  });
  if (!found) {
    throw new ShippingValidationError(
      `La tarifa de Correo seleccionada (${key}) ya no está disponible. Volvé a cotizar el envío.`
    );
  }
  return found.price;
}

export async function resolveServerShippingQuoteAmount(
  empresaId: number,
  provider: ShippingProviderName,
  deliveryType: ShippingDeliveryType,
  parcel: ShippingParcel,
  cpDestino: string,
  options?: { correoProductType?: string }
): Promise<{
  amount: number;
  correoQuotes?: CorreoShippingQuote[];
  andreaniRaw?: unknown;
}> {
  if (provider === 'andreani') {
    const r = await shippingService.quoteAndreani({
      empresaId,
      cpDestino,
      deliveryType,
      parcel,
      provider: 'andreani',
    });
    return { amount: r.precio, andreaniRaw: r.raw };
  }
  if (provider === 'correo') {
    const quotes = await shippingService.quoteCorreo({
      empresaId,
      cpDestino,
      deliveryType,
      parcel,
    });
    const amount = pickCorreoPrice(quotes, options?.correoProductType);
    return { amount, correoQuotes: quotes };
  }
  throw new ShippingValidationError(`Proveedor de cotización no soportado: ${provider}`);
}

/** Respuesta para `POST /checkout/shipping/quote`. */
export async function quoteCheckoutShipping(params: {
  empresaId: number;
  provider: ShippingProviderName;
  deliveryType: ShippingDeliveryType;
  items: CheckoutShippingItemInput[];
  declaredValueSubtotal: number;
  cpDestino: string;
}): Promise<{
  precio: number;
  moneda: string;
  provider: ShippingProviderName;
  parcel: ShippingParcel;
  correoOpciones?: CorreoShippingQuote[];
  raw?: unknown;
}> {
  const parcel = await buildParcelFromCheckoutItems(
    params.empresaId,
    params.items,
    params.declaredValueSubtotal
  );
  const { amount, correoQuotes, andreaniRaw } = await resolveServerShippingQuoteAmount(
    params.empresaId,
    params.provider,
    params.deliveryType,
    parcel,
    params.cpDestino,
    params.provider === 'correo' ? {} : undefined
  );
  return {
    precio: amount,
    moneda: 'ARS',
    provider: params.provider,
    parcel,
    correoOpciones: correoQuotes,
    raw: andreaniRaw ?? (correoQuotes?.length ? { rates: correoQuotes } : undefined),
  };
}

/**
 * Re-cotiza en servidor y valida contra el monto enviado por el cliente (anti-manipulación).
 * El bulto se calcula siempre desde `items` del pedido (ignora medidas del cliente).
 */
export async function validateCheckoutEnvioForMp(
  empresaId: number,
  input: CheckoutEnvioClientPayload,
  items: CheckoutShippingItemInput[],
  declaredValueSubtotal: number
): Promise<{
  costoEnvio: Prisma.Decimal;
  formaEnvio: FormaEnvio;
  snapshot: Prisma.InputJsonValue;
  parcel: ShippingParcel;
}> {
  const parcel = await buildParcelFromCheckoutItems(
    empresaId,
    items,
    declaredValueSubtotal
  );
  const { amount, correoQuotes, andreaniRaw } = await resolveServerShippingQuoteAmount(
    empresaId,
    input.provider,
    input.deliveryType,
    parcel,
    input.cpDestino,
    input.provider === 'correo'
      ? { correoProductType: input.correoProductType }
      : undefined
  );
  if (Math.abs(amount - input.clientQuotedAmount) > CHECKOUT_ENVIO_QUOTE_TOLERANCE_ARS) {
    throw new ShippingValidationError(
      `El costo de envío cambió ($${amount.toFixed(2)}). Volvé a calcular el envío en el checkout.`
    );
  }
  const snapshot = {
    version: 2,
    provider: input.provider,
    deliveryType: input.deliveryType,
    parcel,
    cpDestino: input.cpDestino.trim(),
    correoProductType: input.correoProductType,
    agencyId: input.agencyId,
    agencyLabel: input.agencyLabel,
    validatedAmount: amount,
    address: input.address,
    correoQuotes: correoQuotes?.slice(0, 8),
    andreaniRaw: andreaniRaw ?? undefined,
  };
  return {
    costoEnvio: new Prisma.Decimal(amount.toFixed(2)),
    formaEnvio: mapFormaEnvioCheckout(input.provider, input.deliveryType),
    snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
    parcel,
  };
}
