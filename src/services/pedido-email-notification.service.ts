import { FormaPago, OrderStatus, type Pedido, type PedidoItem, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../lib/email/email.service';
import { formatArs } from '../lib/money-format';
import type { OrderEmailPayload } from '../types/email.types';

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

export function buildOrderEmailPayloadFromPedido(
  pedido: PedidoConItems,
  status: OrderStatus,
  options?: { notes?: string }
): OrderEmailPayload {
  const itemUnits = pedido.items.reduce((acc, it) => acc + Number(it.cantidad), 0);
  const envioLine =
    Number(pedido.costoEnvio) > 0 ? `Costo envío: ${formatArs(Number(pedido.costoEnvio))}` : null;
  const descuento = Number(pedido.descuento);
  const totalNeto = Number(pedido.total) - descuento;

  return {
    orderId: pedido.id,
    customerName: pedido.clienteNombre,
    customerEmail: pedido.clienteEmail,
    customerPhone: pedido.clienteTelefono ?? undefined,
    shippingSummary:
      [pedido.formaEnvio ? String(pedido.formaEnvio) : null, pedido.clienteDireccion ?? null, envioLine]
        .filter(Boolean)
        .join(' · ') || undefined,
    paymentSummary: formaPagoLabel(pedido.formaPago),
    items: pedido.items.map((it) => {
      const espec = [it.talle, it.color].filter(Boolean).join(' / ');
      return {
        nombre: it.nombre,
        cantidad: Number(it.cantidad),
        subtotalFormatted: formatArs(Number(it.subtotal)),
        precioUnitarioFormatted: formatArs(Number(it.precioUnitario)),
        ...(espec ? { especificaciones: espec } : {}),
      };
    }),
    itemCount: pedido.cantidadPrendas ?? Math.round(itemUnits),
    subtotalFormatted: formatArs(Number(pedido.subtotal)),
    ivaFormatted: formatArs(Number(pedido.iva)),
    totalFormatted: formatArs(totalNeto >= 0 ? totalNeto : Number(pedido.total)),
    status,
    notes: options?.notes ?? pedido.observaciones ?? undefined,
  };
}

/** Pedido originado en checkout web (Firebase), no carga manual admin sin usuario. */
export function isPedidoCheckoutEcommerce(pedido: { usuarioId: number | null }): boolean {
  return pedido.usuarioId != null;
}

/**
 * Envía email de estado al cliente (y copia interna en confirmación/cancelación).
 * No lanza: errores solo en log.
 */
export async function sendPedidoStatusEmail(
  pedidoId: number,
  status: OrderStatus,
  options?: { notes?: string; sendInternal?: boolean }
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedido?.clienteEmail?.trim()) return;

  const payload = buildOrderEmailPayloadFromPedido(pedido, status, options);
  try {
    const result = await emailService.sendOrderStatusEmail(payload);
    if (!result.success) {
      console.error(
        `[pedido-email] Falló email ${status} pedido ${pedidoId}:`,
        result.error
      );
    }
    if (options?.sendInternal !== false && (status === OrderStatus.CONFIRMED || status === OrderStatus.CANCELLED)) {
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
  options?: { notes?: string; sendInternal?: boolean }
): void {
  void sendPedidoStatusEmail(pedidoId, status, options);
}
