import type { ShippingProviderName } from '../services/shipping/shipping.types';

const DEFAULT_ANDREANI_TRACKING_URL =
  'https://www.andreani.com/#!/informacionEnvio/{trackingNumber}';
const DEFAULT_CORREO_TRACKING_URL =
  'https://www.correoargentino.com.ar/formularios/ccu/consulta-envio?id={trackingNumber}';

function applyTrackingTemplate(template: string, trackingNumber: string): string {
  return template.replace('{trackingNumber}', encodeURIComponent(trackingNumber));
}

/** URL pública de seguimiento según proveedor (override opcional por env). */
export function buildShippingTrackingUrl(
  provider: ShippingProviderName,
  trackingNumber: string
): string | undefined {
  const tn = trackingNumber.trim();
  if (!tn) return undefined;

  if (provider === 'andreani') {
    const template =
      process.env.ANDREANI_TRACKING_URL?.trim() || DEFAULT_ANDREANI_TRACKING_URL;
    return applyTrackingTemplate(template, tn);
  }

  const template = process.env.CORREO_TRACKING_URL?.trim() || DEFAULT_CORREO_TRACKING_URL;
  return applyTrackingTemplate(template, tn);
}
