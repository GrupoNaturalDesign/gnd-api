import { FormaPago, OrderStatus, type Pedido, type PedidoItem } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../lib/email/email.service';
import { formatArs } from '../lib/money-format';
import type { OrderEmailPayload, OrderStatusUiOverrides } from '../types/email.types';
import {
  requiresPostalShipping,
  resolvePedidoEntregaFromPedido,
} from '../utils/pedido-entrega.util';
import { resolvePedidoShippingTracking } from '../utils/pedido-shipping-tracking.util';
import { empresaTiendaConfigService } from './empresa-tienda-config.service';
import { buildStorePickupConfirmInstructions } from '../lib/store-pickup.config';

function formaPagoLabel(forma: FormaPago | null | undefined): string | undefined {
  if (!forma) return undefined;
  switch (forma) {
    case FormaPago.mercado_pago:
      return 'Mercado Pago';
    case FormaPago.transferencia:
      return 'Transferencia';
    case FormaPago.efectivo:
      return 'Efectivo';
    default:
      return String(forma);
  }
}

type PedidoConItems = Pedido & { items: PedidoItem[] };

function confirmLeadForEntrega(tipo: ReturnType<typeof resolvePedidoEntregaFromPedido>['tipo']): string | undefined {
  switch (tipo) {
    case 'retiro_tienda':
      return 'Recibimos tu pedido y lo estamos preparando. Te avisaremos por email cuando esté listo para retirar.';
    case 'envio_domicilio':
      return '';
    case 'envio_sucursal':
      return 'Tu pedido fue confirmado. Te avisaremos por email cuando el paquete esté en la sucursal indicada.';
    default:
      return undefined;
  }
}

export function buildOrderEmailPayloadFromPedido(
  pedido: PedidoConItems,
  status: OrderStatus,
  options?: {
    notes?: string;
    statusUiOverrides?: OrderStatusUiOverrides;
    deliveryInstructions?: string;
    trackingNumber?: string;
    trackingUrl?: string;
  }
): OrderEmailPayload {
  const itemUnits = pedido.items.reduce((acc, it) => acc + Number(it.cantidad), 0);
  const descuento = Number(pedido.descuento);
  const totalNeto = Number(pedido.total) - descuento;
  const costoEnvio = Number(pedido.costoEnvio ?? 0);
  const entrega = resolvePedidoEntregaFromPedido(pedido);
  const postal = requiresPostalShipping(pedido);
  const resolvedTracking = postal ? resolvePedidoShippingTracking(pedido) : null;
  const trackingNumber =
    options?.trackingNumber ?? resolvedTracking?.trackingNumber ?? undefined;
  const trackingUrl = options?.trackingUrl ?? resolvedTracking?.trackingUrl ?? undefined;

  let deliveryInstructions = options?.deliveryInstructions ?? entrega.deliveryInstructions;
  if (
    postal &&
    status === OrderStatus.CONFIRMED &&
    !trackingNumber &&
    !deliveryInstructions?.includes('número de envío')
  ) {
    const pending =
      'Estamos generando tu número de envío. Te lo enviaremos por email en cuanto esté disponible.';
    deliveryInstructions = deliveryInstructions
      ? `${deliveryInstructions} ${pending}`
      : pending;
  }

  let statusUiOverrides = options?.statusUiOverrides;
  if (status === OrderStatus.CONFIRMED && !statusUiOverrides) {
    const lead = confirmLeadForEntrega(entrega.tipo);
    if (lead) statusUiOverrides = { lead };
    else if (postal && trackingNumber) {
      statusUiOverrides = {
        lead: 'Tu pedido fue confirmado. Ya podés hacer seguimiento del envío con el número indicado abajo.',
      };
    }
  }

  return {
    orderId: pedido.id,
    empresaId: pedido.empresaId,
    customerName: pedido.clienteNombre,
    customerEmail: pedido.clienteEmail,
    customerPhone: pedido.clienteTelefono ?? undefined,
    shippingSummary: entrega.shippingSummary,
    deliveryInstructions,
    paymentSummary: formaPagoLabel(pedido.formaPago),
    items: pedido.items.map((it) => {
      const espec = [it.talle, it.color].filter(Boolean).join(' / ');
      return {
        nombre: it.nombre,
        cantidad: Number(it.cantidad),
        subtotalFormatted: formatArs(Number(it.subtotal)),
        precioUnitarioFormatted: formatArs(Number(it.precioUnitario)),
        ...(espec ? { especificaciones: espec } : {}),
        ...(it.bordado ? { bordado: true } : {}),
      };
    }),
    itemCount: pedido.cantidadPrendas ?? Math.round(itemUnits),
    subtotalFormatted: formatArs(Number(pedido.subtotal)),
    ivaFormatted: formatArs(Number(pedido.iva)),
    ...(costoEnvio > 0 ? { shippingCostFormatted: formatArs(costoEnvio) } : {}),
    totalFormatted: formatArs(totalNeto >= 0 ? totalNeto : Number(pedido.total)),
    status,
    notes: options?.notes ?? pedido.observaciones ?? undefined,
    statusUiOverrides,
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(pedido.necesitaFactura &&
    pedido.facturaTipo &&
    pedido.facturaCuit &&
    pedido.facturaRazonSocial
      ? {
          facturacion: {
            tipo: pedido.facturaTipo as 'A' | 'C',
            cuit: pedido.facturaCuit,
            razonSocial: pedido.facturaRazonSocial,
          },
        }
      : {}),
  };
}

/** Pedido originado en checkout web (Firebase), no carga manual admin sin usuario. */
export function isPedidoCheckoutEcommerce(pedido: { usuarioId: number | null }): boolean {
  return pedido.usuarioId != null;
}

/**
 * Envía email de estado al cliente (y copia interna al crear pedido ecommerce o cancelar).
 * No lanza: errores solo en log.
 */
export async function sendPedidoStatusEmail(
  pedidoId: number,
  status: OrderStatus,
  options?: {
    notes?: string;
    sendInternal?: boolean;
    statusUiOverrides?: OrderStatusUiOverrides;
    deliveryInstructions?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    source?: 'automatic' | 'admin_manual';
  }
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedido?.clienteEmail?.trim()) return;

  const payload = buildOrderEmailPayloadFromPedido(pedido, status, {
    ...options,
  });
  const entrega = resolvePedidoEntregaFromPedido(pedido);
  if (entrega.tipo === 'retiro_tienda') {
    const tienda = await empresaTiendaConfigService.getTiendaConfigPublic(pedido.empresaId);
    const orderRef = `WEB-${pedido.id}`;
    payload.deliveryInstructions = buildStorePickupConfirmInstructions(
      orderRef,
      tienda.retiroDireccion
    );
  }
  payload.source = options?.source ?? 'automatic';
  try {
    const result = await emailService.sendOrderStatusEmail(payload);
    if (!result.success) {
      console.error(
        `[pedido-email] Falló email ${status} pedido ${pedidoId}:`,
        result.error
      );
    }
    const ecommerce = isPedidoCheckoutEcommerce(pedido);
    const shouldSendInternal =
      options?.sendInternal !== false &&
      ((status === OrderStatus.PENDING && ecommerce) || status === OrderStatus.CANCELLED);
    if (shouldSendInternal) {
      void emailService.sendInternalOrderNotification(payload);
    }
  } catch (e) {
    console.error(`[pedido-email] Error enviando email pedido ${pedidoId}:`, e);
  }
}

/** Fire-and-forget para no bloquear checkout/webhooks/jobs. */
export function sendPedidoStatusEmailAsync(
  pedidoId: number,
  status: OrderStatus,
  options?: {
    notes?: string;
    sendInternal?: boolean;
    statusUiOverrides?: OrderStatusUiOverrides;
    deliveryInstructions?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    source?: 'automatic' | 'admin_manual';
  }
): void {
  void sendPedidoStatusEmail(pedidoId, status, options);
}
