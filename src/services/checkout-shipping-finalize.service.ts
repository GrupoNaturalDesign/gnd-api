import { AdminNotificationSeverity, EstadoPedido, type FormaEnvio, type Pedido } from '@prisma/client';
import prisma from '../lib/prisma';
import { adminNotificationService } from './admin-notification.service';
import { shippingService } from './shipping/shipping.service';
import type {
  CreateShippingOrderInput,
  ShippingAddress,
  ShippingDeliveryType,
  ShippingParcel,
  ShippingProviderName,
} from './shipping/shipping.types';
import { ShippingValidationError } from './shipping/shipping.errors';
import {
  isRetiroEnTienda,
  parseCheckoutEnvioSnapshot,
  requiresPostalShipping,
  type CheckoutEnvioSnapshot,
} from '../utils/pedido-entrega.util';
import { resolvePedidoShippingTracking } from '../utils/pedido-shipping-tracking.util';
import { shippingLogger } from '../lib/shipping-logger';

const DEFAULT_PARCEL: Omit<ShippingParcel, 'declaredValue'> = {
  weightGrams: 1000,
  height: 20,
  width: 30,
  depth: 10,
};

function providerFromFormaEnvio(forma: FormaEnvio | null | undefined): ShippingProviderName | null {
  if (!forma) return null;
  const s = String(forma);
  if (s.startsWith('andreani')) return 'andreani';
  if (s.startsWith('correo')) return 'correo';
  return null;
}

function resolveProvider(
  snap: CheckoutEnvioSnapshot | null,
  formaEnvio: FormaEnvio | null | undefined
): ShippingProviderName | null {
  if (snap?.provider === 'andreani' || snap?.provider === 'correo') {
    return snap.provider;
  }
  return providerFromFormaEnvio(formaEnvio);
}

function resolveDeliveryType(
  snap: CheckoutEnvioSnapshot | null,
  formaEnvio: FormaEnvio | null | undefined
): ShippingDeliveryType {
  if (snap?.deliveryType === 'agency' || snap?.deliveryType === 'homeDelivery') {
    return snap.deliveryType;
  }
  if (formaEnvio && String(formaEnvio).includes('sucursal')) return 'agency';
  return 'homeDelivery';
}

function resolveParcel(
  snap: CheckoutEnvioSnapshot | null,
  declaredValue: number
): ShippingParcel {
  const p = snap?.parcel;
  if (
    p &&
    Number(p.weightGrams) > 0 &&
    Number(p.height) > 0 &&
    Number(p.width) > 0 &&
    Number(p.depth) > 0
  ) {
    return {
      weightGrams: Number(p.weightGrams),
      height: Number(p.height),
      width: Number(p.width),
      depth: Number(p.depth),
      declaredValue: Number(p.declaredValue ?? declaredValue) || declaredValue,
    };
  }
  return {
    ...DEFAULT_PARCEL,
    declaredValue: Math.max(0, declaredValue),
  };
}

function snapshotAddressToShippingAddress(
  snap: CheckoutEnvioSnapshot,
  pedido: Pick<Pedido, 'clienteDireccion' | 'entregaCp'>
): ShippingAddress | null {
  const addr = snap.address;
  const streetName = (addr?.streetName ?? addr?.street)?.trim();
  const city = (addr?.city ?? addr?.province)?.trim();
  const state = (addr?.state ?? addr?.province)?.trim();
  const zipCode = (addr?.zipCode ?? snap.cpDestino ?? pedido.entregaCp)?.trim();
  const streetNumber = addr?.streetNumber?.trim() || 's/n';

  if (streetName && city && state && zipCode) {
    return {
      streetName,
      streetNumber,
      city,
      state,
      zipCode,
      ...(addr?.floor ? { floor: addr.floor } : {}),
      ...(addr?.department ? { department: addr.department } : {}),
    };
  }

  const fallback = pedido.clienteDireccion?.trim();
  if (fallback && zipCode) {
    return {
      streetName: fallback,
      streetNumber: 's/n',
      city: city || '—',
      state: state || '—',
      zipCode,
    };
  }

  return null;
}

export type BuildShippingOrderInputResult =
  | { ok: true; input: CreateShippingOrderInput }
  | { ok: false; reason: 'retiro' | 'already_has_tracking' | 'invalid_config'; message: string };

/** Arma el input de carrier desde pedido confirmado (snapshot + datos cliente). */
export function buildCreateShippingOrderInputFromPedido(
  pedido: Pick<
    Pedido,
    | 'id'
    | 'empresaId'
    | 'formaEnvio'
    | 'checkoutEnvioSnapshot'
    | 'clienteNombre'
    | 'clienteEmail'
    | 'clienteTelefono'
    | 'clienteDireccion'
    | 'entregaCp'
    | 'andreaniSucursalId'
    | 'andreaniNumeroEnvio'
    | 'correoTrackingNumber'
    | 'trackingUrl'
    | 'subtotal'
    | 'total'
    | 'costoEnvio'
  >
): BuildShippingOrderInputResult {
  if (isRetiroEnTienda(pedido)) {
    return { ok: false, reason: 'retiro', message: 'Retiro en tienda: sin envío postal.' };
  }

  const existing = resolvePedidoShippingTracking(pedido);
  if (existing.trackingNumber) {
    return {
      ok: false,
      reason: 'already_has_tracking',
      message: 'El pedido ya tiene número de envío.',
    };
  }

  const snap = parseCheckoutEnvioSnapshot(pedido.checkoutEnvioSnapshot);
  const provider = resolveProvider(snap, pedido.formaEnvio);
  if (!provider) {
    return {
      ok: false,
      reason: 'invalid_config',
      message: 'No se pudo determinar el proveedor de envío (snapshot o formaEnvio).',
    };
  }

  const deliveryType = resolveDeliveryType(snap, pedido.formaEnvio);
  const declaredValue = Math.max(0, Number(pedido.subtotal) || Number(pedido.total) || 0);
  const parcel = resolveParcel(snap, declaredValue);

  if (deliveryType === 'agency') {
    const agencyId = snap?.agencyId?.trim() || pedido.andreaniSucursalId?.trim();
    if (!agencyId) {
      return {
        ok: false,
        reason: 'invalid_config',
        message: 'Falta agencyId para retiro en sucursal.',
      };
    }
    return {
      ok: true,
      input: {
        pedidoId: pedido.id,
        empresaId: pedido.empresaId,
        provider,
        deliveryType,
        agencyId,
        recipient: {
          name: pedido.clienteNombre,
          email: pedido.clienteEmail,
          phone: pedido.clienteTelefono ?? undefined,
        },
        parcel,
      },
    };
  }

  const address = snapshotAddressToShippingAddress(
    snap ?? { cpDestino: pedido.entregaCp ?? undefined },
    pedido
  );

  if (!address) {
    return {
      ok: false,
      reason: 'invalid_config',
      message: 'Falta dirección de entrega para envío a domicilio.',
    };
  }

  return {
    ok: true,
    input: {
      pedidoId: pedido.id,
      empresaId: pedido.empresaId,
      provider,
      deliveryType: 'homeDelivery',
      recipient: {
        name: pedido.clienteNombre,
        email: pedido.clienteEmail,
        phone: pedido.clienteTelefono ?? undefined,
      },
      address,
      parcel,
    },
  };
}

export interface FinalizeShippingResult {
  ok: boolean;
  skipped?: boolean;
  trackingNumber?: string;
  error?: string;
}

/**
 * Crea la orden en Andreani/Correo tras confirmar el pedido (MP o confirmación manual).
 * No lanza: errores se registran y notifican al admin.
 */
export async function finalizeShippingAfterPaymentApproved(
  pedidoId: number
): Promise<FinalizeShippingResult> {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) {
    return { ok: false, error: `Pedido ${pedidoId} no encontrado` };
  }

  if (!requiresPostalShipping(pedido)) {
    return { ok: true, skipped: true };
  }

  const built = buildCreateShippingOrderInputFromPedido(pedido);
  if (!built.ok) {
    if (built.reason === 'already_has_tracking' || built.reason === 'retiro') {
      return { ok: true, skipped: true };
    }
    shippingLogger.warn('finalizeShipping: no se pudo armar input', {
      pedidoId,
      reason: built.reason,
      message: built.message,
    });
    return { ok: false, error: built.message };
  }

  try {
    const result = await shippingService.createOrder(built.input);
    shippingLogger.info('finalizeShipping OK', {
      pedidoId,
      provider: result.provider,
      trackingNumber: result.trackingNumber,
    });
    return { ok: true, trackingNumber: result.trackingNumber };
  } catch (e: unknown) {
    const msg =
      e instanceof ShippingValidationError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    shippingLogger.error('finalizeShipping falló', { pedidoId, error: msg });
    try {
      await adminNotificationService.notifyPedido({
        empresaId: pedido.empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Pedido #${pedidoId}: falló alta en carrier`,
        message: msg,
        payload: { source: 'finalizeShippingAfterPaymentApproved' },
        dedupe: false,
      });
    } catch {
      /* ignore notification errors */
    }
    return { ok: false, error: msg };
  }
}

/** Fire-and-forget (reintentos job / admin). */
export function finalizeShippingAfterPaymentApprovedAsync(pedidoId: number): void {
  void finalizeShippingAfterPaymentApproved(pedidoId);
}

/** Reintenta pedidos confirmados con envío postal sin número de seguimiento. */
export async function reintentarEnviosPostalPendientes(limit = 20): Promise<{
  processed: number;
  ok: number;
  failed: number;
}> {
  const rows = await prisma.pedido.findMany({
    where: {
      estadoInterno: {
        in: [EstadoPedido.confirmado, EstadoPedido.procesando, EstadoPedido.despachado],
      },
    },
    orderBy: { fechaConfirmacion: 'asc' },
    take: limit * 5,
  });

  let processed = 0;
  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    if (processed >= limit) break;
    if (!requiresPostalShipping(row)) continue;
    const { trackingNumber } = resolvePedidoShippingTracking(row);
    if (trackingNumber) continue;

    processed += 1;
    const r = await finalizeShippingAfterPaymentApproved(row.id);
    if (r.ok && !r.error) ok += 1;
    else if (!r.skipped) failed += 1;
  }

  return { processed, ok, failed };
}
