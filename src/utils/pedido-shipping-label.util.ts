import type { FormaEnvio } from '@prisma/client';
import { requiresPostalShipping, type PedidoEntregaInput } from './pedido-entrega.util';
import { resolvePedidoShippingTracking } from './pedido-shipping-tracking.util';
import type { ShippingProviderName } from '../services/shipping/shipping.types';

export type PedidoLabelReason =
  | 'retiro_tienda'
  | 'correo_portal_only'
  | 'missing_provider'
  | 'missing_tracking'
  | 'missing_andreani_agrupador'
  | 'andreani_ready';

export interface PedidoLabelAvailability {
  canDownload: boolean;
  provider: ShippingProviderName | null;
  trackingNumber: string | null;
  reason: PedidoLabelReason;
  message: string;
}

export type PedidoLabelInput = PedidoEntregaInput & {
  formaEnvio?: FormaEnvio | null;
  checkoutEnvioSnapshot?: unknown;
  andreaniNumeroEnvio?: string | null;
  correoTrackingNumber?: string | null;
  andreaniAgrupadorBultos?: string | null;
  trackingUrl?: string | null;
};

const MESSAGES: Record<PedidoLabelReason, string> = {
  retiro_tienda: 'Retiro en tienda: no aplica etiqueta de envío postal.',
  correo_portal_only:
    'Correo Argentino (MiCorreo) no permite descargar etiquetas por API. Usá el portal MiCorreo.',
  missing_provider: 'No se pudo determinar el proveedor de envío del pedido.',
  missing_tracking:
    'Creá la orden de envío primero (POST /admin/pedidos/:id/crear-envio).',
  missing_andreani_agrupador:
    'Falta el agrupador de bultos Andreani. Volvé a crear la orden de envío.',
  andreani_ready: 'Etiqueta disponible para descarga.',
};

export function resolvePedidoLabelAvailability(
  pedido: PedidoLabelInput
): PedidoLabelAvailability {
  if (!requiresPostalShipping(pedido)) {
    return {
      canDownload: false,
      provider: null,
      trackingNumber: null,
      reason: 'retiro_tienda',
      message: MESSAGES.retiro_tienda,
    };
  }

  const { shippingProvider, trackingNumber } = resolvePedidoShippingTracking({
    formaEnvio: pedido.formaEnvio ?? null,
    checkoutEnvioSnapshot: pedido.checkoutEnvioSnapshot ?? null,
    andreaniNumeroEnvio: pedido.andreaniNumeroEnvio ?? null,
    correoTrackingNumber: pedido.correoTrackingNumber ?? null,
    trackingUrl: pedido.trackingUrl ?? null,
  });

  if (!shippingProvider) {
    return {
      canDownload: false,
      provider: null,
      trackingNumber: null,
      reason: 'missing_provider',
      message: MESSAGES.missing_provider,
    };
  }

  if (shippingProvider === 'correo') {
    return {
      canDownload: false,
      provider: 'correo',
      trackingNumber,
      reason: 'correo_portal_only',
      message: MESSAGES.correo_portal_only,
    };
  }

  if (!trackingNumber) {
    return {
      canDownload: false,
      provider: 'andreani',
      trackingNumber: null,
      reason: 'missing_tracking',
      message: MESSAGES.missing_tracking,
    };
  }

  const agrupador = pedido.andreaniAgrupadorBultos?.trim() || null;
  if (!agrupador) {
    return {
      canDownload: false,
      provider: 'andreani',
      trackingNumber,
      reason: 'missing_andreani_agrupador',
      message: MESSAGES.missing_andreani_agrupador,
    };
  }

  return {
    canDownload: true,
    provider: 'andreani',
    trackingNumber,
    reason: 'andreani_ready',
    message: MESSAGES.andreani_ready,
  };
}

export function httpStatusForPedidoLabelReason(reason: PedidoLabelReason): number {
  switch (reason) {
    case 'retiro_tienda':
    case 'missing_provider':
      return 400;
    case 'correo_portal_only':
      return 422;
    case 'missing_tracking':
    case 'missing_andreani_agrupador':
      return 409;
    case 'andreani_ready':
      return 200;
    default:
      return 400;
  }
}
