import type { CheckoutEnvioClientPayload } from '../services/checkout-shipping.service';

export type CheckoutEnvioSelectionInput = Omit<
  CheckoutEnvioClientPayload,
  'clientQuotedAmount' | 'parcel'
>;

export function parseParcelForCheckout(
  raw: unknown
): CheckoutEnvioClientPayload['parcel'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const weightGrams = Number(p.weightGrams);
  const height = Number(p.height);
  const width = Number(p.width);
  const depth = Number(p.depth);
  const declaredValue = Number(p.declaredValue);
  if (
    !Number.isFinite(weightGrams) ||
    weightGrams <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(depth) ||
    depth <= 0 ||
    !Number.isFinite(declaredValue) ||
    declaredValue < 0
  ) {
    return null;
  }
  return { weightGrams, height, width, depth, declaredValue };
}

export function parseAddressForCheckout(
  raw: unknown
): CheckoutEnvioClientPayload['address'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  const streetName = typeof a.streetName === 'string' ? a.streetName.trim() : '';
  const streetNumber = typeof a.streetNumber === 'string' ? a.streetNumber.trim() : '';
  const city = typeof a.city === 'string' ? a.city.trim() : '';
  const state = typeof a.state === 'string' ? a.state.trim() : '';
  const zipCode = typeof a.zipCode === 'string' ? a.zipCode.trim() : '';
  if (!streetName || !city || !state || !zipCode) return undefined;
  const floor = typeof a.floor === 'string' ? a.floor.trim() : undefined;
  const department = typeof a.department === 'string' ? a.department.trim() : undefined;
  const barrio = typeof a.barrio === 'string' ? a.barrio.trim() : undefined;
  const loteManzana = typeof a.loteManzana === 'string' ? a.loteManzana.trim() : undefined;
  return {
    streetName,
    streetNumber: streetNumber || 's/n',
    city,
    state,
    zipCode,
    ...(floor ? { floor } : {}),
    ...(department ? { department } : {}),
    ...(barrio ? { barrio } : {}),
    ...(loteManzana ? { loteManzana } : {}),
  };
}

/** Body opcional `checkoutEnvio` al iniciar MP; validación exhaustiva en servidor. */
export function parseCheckoutEnvio(raw: unknown): CheckoutEnvioClientPayload | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const deliveryType = o.deliveryType;
  if (provider !== 'correo' && provider !== 'andreani') return null;
  if (deliveryType !== 'homeDelivery' && deliveryType !== 'agency') return null;
  const cpDestino = typeof o.cpDestino === 'string' ? o.cpDestino.trim() : '';
  if (cpDestino.length < 2) return null;
  const clientQuotedAmount = Number(o.clientQuotedAmount);
  if (!Number.isFinite(clientQuotedAmount) || clientQuotedAmount < 0) return null;
  const agencyId = typeof o.agencyId === 'string' ? o.agencyId.trim() : undefined;
  const agencyLabel = typeof o.agencyLabel === 'string' ? o.agencyLabel.trim() : undefined;
  const correoProductTypeRaw = o.correoProductType;
  const correoProductType =
    typeof correoProductTypeRaw === 'string' && correoProductTypeRaw.trim()
      ? correoProductTypeRaw.trim()
      : undefined;
  if (deliveryType === 'agency' && !agencyId) return null;
  const address = parseAddressForCheckout(o.address);
  if (deliveryType === 'homeDelivery' && !address) return null;
  const parcel = parseParcelForCheckout(o.parcel) ?? undefined;
  return {
    provider,
    deliveryType,
    cpDestino,
    clientQuotedAmount,
    ...(parcel ? { parcel } : {}),
    ...(correoProductType ? { correoProductType } : {}),
    ...(agencyId ? { agencyId } : {}),
    ...(agencyLabel ? { agencyLabel } : {}),
    ...(address ? { address } : {}),
  };
}

/** Selección de envío para quote (sin monto ni bulto del cliente). */
export function parseCheckoutEnvioSelection(
  raw: unknown
): CheckoutEnvioSelectionInput | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider;
  const deliveryType = o.deliveryType;
  if (provider !== 'correo' && provider !== 'andreani') return null;
  if (deliveryType !== 'homeDelivery' && deliveryType !== 'agency') return null;
  const cpDestino = typeof o.cpDestino === 'string' ? o.cpDestino.trim() : '';
  if (cpDestino.length < 2) return null;
  const agencyId = typeof o.agencyId === 'string' ? o.agencyId.trim() : undefined;
  const agencyLabel = typeof o.agencyLabel === 'string' ? o.agencyLabel.trim() : undefined;
  const correoProductTypeRaw = o.correoProductType;
  const correoProductType =
    typeof correoProductTypeRaw === 'string' && correoProductTypeRaw.trim()
      ? correoProductTypeRaw.trim()
      : undefined;
  if (deliveryType === 'agency' && !agencyId) return null;
  const address = parseAddressForCheckout(o.address);
  if (deliveryType === 'homeDelivery' && !address) return null;
  return {
    provider,
    deliveryType,
    cpDestino,
    ...(correoProductType ? { correoProductType } : {}),
    ...(agencyId ? { agencyId } : {}),
    ...(agencyLabel ? { agencyLabel } : {}),
    ...(address ? { address } : {}),
  };
}
