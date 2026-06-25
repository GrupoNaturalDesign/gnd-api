import type { FormaEnvio, Pedido } from '@prisma/client';
import { formatArs } from '../lib/money-format';
import {
  buildStorePickupConfirmInstructions,
  formatPedidoNumero,
} from '../lib/store-pickup.config';

export type PedidoEntregaTipo =
  | 'retiro_tienda'
  | 'envio_domicilio'
  | 'envio_sucursal'
  | 'desconocido';

export interface CheckoutEnvioSnapshot {
  version?: number;
  provider?: string;
  deliveryType?: string;
  cpDestino?: string;
  agencyLabel?: string;
  agencyId?: string;
  clientQuotedAmount?: number;
  parcel?: {
    weightGrams: number;
    height: number;
    width: number;
    depth: number;
    declaredValue: number;
  };
  address?: {
    streetName?: string;
    street?: string;
    streetNumber?: string;
    city?: string;
    province?: string;
    state?: string;
    zipCode?: string;
    floor?: string;
    department?: string;
    barrio?: string;
    loteManzana?: string;
  };
}

export interface PedidoEntregaInput {
  formaEnvio?: FormaEnvio | null;
  costoEnvio?: unknown;
  checkoutEnvioSnapshot?: unknown;
  clienteDireccion?: string | null;
  andreaniSucursalId?: string | null;
  andreaniSucursalDescripcion?: string | null;
  entregaCp?: string | null;
}

export interface PedidoEntregaInfo {
  tipo: PedidoEntregaTipo;
  label: string;
  detalle?: string;
  shippingSummary: string;
  /** Texto para bloque Entrega / instrucciones en emails de confirmación. */
  deliveryInstructions?: string;
}

const FORMA_ENVIO_LABELS: Record<string, string> = {
  andreani_sucursal: 'Andreani · retiro en sucursal',
  andreani_domicilio: 'Andreani · envío a domicilio',
  correo_sucursal: 'Correo Argentino · retiro en sucursal',
  correo_domicilio: 'Correo Argentino · envío a domicilio',
};

function parseSnapshot(raw: unknown): CheckoutEnvioSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CheckoutEnvioSnapshot;
}

function providerLabel(provider?: string): string {
  if (provider === 'andreani') return 'Andreani';
  if (provider === 'correo') return 'Correo Argentino';
  return provider ?? 'Envío';
}

function labelFromSnapshot(snap: CheckoutEnvioSnapshot): { label: string; detalle?: string; tipo: PedidoEntregaTipo } {
  const provider = providerLabel(snap.provider);
  if (snap.deliveryType === 'agency') {
    const suc = snap.agencyLabel?.trim();
    return {
      tipo: 'envio_sucursal',
      label: suc ? `${provider} · retiro en sucursal (${suc})` : `${provider} · retiro en sucursal`,
      detalle: snap.cpDestino ? `CP ${snap.cpDestino}` : undefined,
    };
  }
  if (snap.deliveryType === 'homeDelivery') {
    const addr = snap.address;
    const street = addr?.streetName ?? addr?.street;
    const parts = addr
      ? [
          street,
          addr.streetNumber,
          addr.floor ? `Piso ${addr.floor}` : null,
          addr.department ? `Depto ${addr.department}` : null,
          addr.barrio ? `Barrio ${addr.barrio}` : null,
          addr.loteManzana ? `Lote/Mz ${addr.loteManzana}` : null,
          addr.city ?? addr.state,
          addr.zipCode,
        ].filter(Boolean)
      : [];
    const dir = parts.length ? parts.join(', ') : null;
    return {
      tipo: 'envio_domicilio',
      label: dir ? `${provider} · envío a domicilio (${dir})` : `${provider} · envío a domicilio`,
      detalle: snap.cpDestino ? `CP ${snap.cpDestino}` : undefined,
    };
  }
  return { tipo: 'desconocido', label: provider };
}

function isLikelyRetiroTienda(input: PedidoEntregaInput): boolean {
  const costo = Number(input.costoEnvio ?? 0);
  return (
    !input.formaEnvio &&
    costo <= 0 &&
    !input.entregaCp?.trim() &&
    !input.andreaniSucursalId &&
    !parseSnapshot(input.checkoutEnvioSnapshot)
  );
}

export function resolvePedidoEntrega(
  input: PedidoEntregaInput,
  options?: { orderRef?: string }
): PedidoEntregaInfo {
  const snap = parseSnapshot(input.checkoutEnvioSnapshot);
  const costo = Number(input.costoEnvio ?? 0);
  const envioLine = costo > 0 ? `Costo envío: ${formatArs(costo)}` : null;

  if (snap) {
    const fromSnap = labelFromSnapshot(snap);
    const shippingSummary = [fromSnap.label, envioLine].filter(Boolean).join(' · ');
    let deliveryInstructions: string | undefined;
    if (fromSnap.tipo === 'envio_domicilio') {
      deliveryInstructions =
        'Te avisaremos por email cuando despachemos tu pedido con el carrier seleccionado.';
    } else if (fromSnap.tipo === 'envio_sucursal') {
      deliveryInstructions =
        'Te avisaremos por email cuando el paquete esté disponible para retirar en la sucursal indicada.';
    }
    return {
      tipo: fromSnap.tipo,
      label: fromSnap.label,
      detalle: fromSnap.detalle,
      shippingSummary,
      deliveryInstructions,
    };
  }

  if (isLikelyRetiroTienda(input)) {
    const orderRef = options?.orderRef ?? 'tu pedido';
    return {
      tipo: 'retiro_tienda',
      label: 'Retiro en tienda',
      detalle: 'Retiro en punto GND (sin envío postal).',
      shippingSummary: 'Retiro en tienda',
      deliveryInstructions: buildStorePickupConfirmInstructions(orderRef),
    };
  }

  if (input.formaEnvio) {
    const label = FORMA_ENVIO_LABELS[String(input.formaEnvio)] ?? String(input.formaEnvio);
    const extras: string[] = [];
    if (input.andreaniSucursalDescripcion) {
      extras.push(`Sucursal: ${input.andreaniSucursalDescripcion}`);
    } else if (input.andreaniSucursalId) {
      extras.push(`Sucursal ID: ${input.andreaniSucursalId}`);
    }
    if (input.entregaCp) extras.push(`CP ${input.entregaCp}`);
    const shippingSummary = [label, input.clienteDireccion ?? null, envioLine, ...extras]
      .filter(Boolean)
      .join(' · ');
    return {
      tipo: input.formaEnvio.includes('sucursal') ? 'envio_sucursal' : 'envio_domicilio',
      label,
      detalle: extras.length ? extras.join(' · ') : undefined,
      shippingSummary,
      deliveryInstructions: 'Te avisaremos por email sobre el envío de tu pedido.',
    };
  }

  const shippingSummary =
    [input.clienteDireccion ?? null, envioLine].filter(Boolean).join(' · ') || 'Entrega no especificada';
  return {
    tipo: 'desconocido',
    label: 'No especificado',
    detalle: input.clienteDireccion?.trim() || undefined,
    shippingSummary,
  };
}

export function resolvePedidoEntregaFromPedido(
  pedido: PedidoEntregaInput & { id: number; sfactoryExternalOrderId?: string | null }
): PedidoEntregaInfo {
  return resolvePedidoEntrega(pedido, {
    orderRef: formatPedidoNumero(pedido.id, pedido.sfactoryExternalOrderId),
  });
}

export function isRetiroEnTienda(input: PedidoEntregaInput): boolean {
  return resolvePedidoEntrega(input).tipo === 'retiro_tienda';
}

/** Pedido con envío postal (Andreani/Correo), no retiro en tienda. */
export function requiresPostalShipping(input: PedidoEntregaInput): boolean {
  return !isRetiroEnTienda(input);
}

export function parseCheckoutEnvioSnapshot(raw: unknown): CheckoutEnvioSnapshot | null {
  return parseSnapshot(raw);
}
