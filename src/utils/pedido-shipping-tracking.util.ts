import type { FormaEnvio, Pedido } from '@prisma/client';
import type { ShippingProviderName } from '../services/shipping/shipping.types';

type PedidoTrackingFields = Pick<
  Pedido,
  | 'formaEnvio'
  | 'andreaniNumeroEnvio'
  | 'correoTrackingNumber'
  | 'trackingUrl'
  | 'checkoutEnvioSnapshot'
>;

function providerFromFormaEnvio(forma: FormaEnvio | null | undefined): ShippingProviderName | null {
  if (!forma) return null;
  const s = String(forma);
  if (s.startsWith('andreani')) return 'andreani';
  if (s.startsWith('correo')) return 'correo';
  return null;
}

function providerFromSnapshot(raw: unknown): ShippingProviderName | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = (raw as Record<string, unknown>).provider;
  if (p === 'andreani' || p === 'correo') return p;
  return null;
}

/** Nº de envío + proveedor unificados para API/admin. */
export function resolvePedidoShippingTracking(pedido: PedidoTrackingFields): {
  shippingProvider: ShippingProviderName | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
} {
  const fromSnapshot = providerFromSnapshot(pedido.checkoutEnvioSnapshot);
  const fromForma = providerFromFormaEnvio(pedido.formaEnvio);
  const shippingProvider = fromSnapshot ?? fromForma;

  const andreani = pedido.andreaniNumeroEnvio?.trim() || null;
  const correo = pedido.correoTrackingNumber?.trim() || null;

  let trackingNumber: string | null = null;
  if (shippingProvider === 'andreani') trackingNumber = andreani;
  else if (shippingProvider === 'correo') trackingNumber = correo;
  else trackingNumber = andreani ?? correo;

  return {
    shippingProvider,
    trackingNumber,
    trackingUrl: pedido.trackingUrl?.trim() || null,
  };
}
