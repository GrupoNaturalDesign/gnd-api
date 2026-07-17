import { FormaPago } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../lib/email/email.service';
import { formatArs } from '../lib/money-format';
import { formatCheckoutExpiresAt } from './pedido-payment-instructions.service';
import { computePedidoTotalNeto } from '../utils/pedido-totals.util';
import type { OrderExpiringSoonEmailProps } from '../emails/OrderExpiringSoonEmail';

export function getClientStoreBaseUrl(): string {
  const raw =
    process.env.CLIENT_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3002';
  return raw.replace(/\/$/, '');
}

function formaPagoToEmail(
  forma: FormaPago | null | undefined
): OrderExpiringSoonEmailProps['formaPago'] | null {
  if (forma === FormaPago.mercado_pago) return 'mercado_pago';
  if (forma === FormaPago.transferencia) return 'transferencia';
  if (forma === FormaPago.efectivo) return 'efectivo';
  return null;
}

export async function hasRecentOrderExpiringEmail(
  pedidoId: number,
  since: Date
): Promise<boolean> {
  const recent = await prisma.emailLog.findMany({
    where: {
      type: 'order_expiring_soon',
      createdAt: { gte: since },
    },
    select: { metadata: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });

  return recent.some((log) => {
    const meta = log.metadata as { pedidoId?: number } | null;
    return meta?.pedidoId === pedidoId;
  });
}

export async function sendPedidoExpiringSoonEmailIfNeeded(
  pedido: {
    id: number;
    clienteEmail: string | null;
    clienteNombre: string | null;
    expiresAt: Date | null;
    formaPago: FormaPago | null;
    total: { toNumber?: () => number } | number | string;
  },
  dedupeSince: Date
): Promise<{ sent: boolean; skipped?: string }> {
  const email = pedido.clienteEmail?.trim();
  if (!email) {
    return { sent: false, skipped: 'sin_email' };
  }

  const forma = formaPagoToEmail(pedido.formaPago);
  if (!forma) {
    return { sent: false, skipped: 'forma_pago' };
  }

  const expiresAtFormatted = formatCheckoutExpiresAt(pedido.expiresAt);
  if (!expiresAtFormatted) {
    return { sent: false, skipped: 'sin_expires_at' };
  }

  if (await hasRecentOrderExpiringEmail(pedido.id, dedupeSince)) {
    return { sent: false, skipped: 'dedupe' };
  }

  const total = computePedidoTotalNeto(pedido);

  const payload: OrderExpiringSoonEmailProps & { customerEmail: string } = {
    customerEmail: email,
    customerName: pedido.clienteNombre?.trim() || 'Cliente',
    orderId: pedido.id,
    externalOrderId: `WEB-${pedido.id}`,
    totalFormatted: formatArs(total),
    expiresAtFormatted,
    formaPago: forma,
    ...(forma === 'transferencia' || forma === 'efectivo'
      ? {
          instructionsUrl: `${getClientStoreBaseUrl()}/checkout/instrucciones-pago?pedidoId=${pedido.id}`,
        }
      : {}),
  };

  const result = await emailService.sendOrderExpiringSoonEmail(payload);
  if (!result.success) {
    console.error(
      `[pedido-expiring-email] Falló email vencimiento pedido ${pedido.id}:`,
      result.error
    );
    return { sent: false, skipped: 'send_failed' };
  }

  return { sent: true };
}
