import { OrderStatus } from '@prisma/client';
import { formatArs } from '../lib/money-format';
import type { OrderConfirmationBody } from '../validation/email.validation';
import type { OrderEmailPayload, OrderLineEmailItem } from '../types/email.types';

function metodoLabel(m: string): string {
  switch (m) {
    case 'mercado_pago':
      return 'Mercado Pago';
    case 'transferencia':
    case 'whatsapp':
      return 'Transferencia';
    case 'efectivo':
      return 'Efectivo';
    case 'tarjeta':
      return 'Tarjeta';
    default:
      return m;
  }
}

function buildShippingSummary(body: OrderConfirmationBody): string | undefined {
  const s = body.shippingData;
  if (!s) return undefined;
  if (s.tipo === 'retiro') return 'Retiro en local / coordinación';
  const parts = [s.direccion, s.localidad, s.provincia, s.codigo_postal].filter(Boolean);
  const base = parts.length > 0 ? parts.join(', ') : 'Envío a domicilio';
  const env = s.checkoutEnvio;
  if (env?.clientQuotedAmount != null) {
    return `${base} · Envío estimado: ${formatArs(env.clientQuotedAmount)}`;
  }
  return base;
}

function buildPaymentSummary(body: OrderConfirmationBody): string | undefined {
  const p = body.paymentData;
  if (!p) return undefined;
  const line = metodoLabel(p.metodo);
  return p.notas ? `${line} · ${p.notas}` : line;
}

function buildNotes(body: OrderConfirmationBody): string | undefined {
  const a = [body.paymentData?.notas, body.shippingData?.notas].filter(Boolean);
  return a.length > 0 ? a.join(' | ') : undefined;
}

export function mapCheckoutBodyToOrderEmailPayload(body: OrderConfirmationBody): OrderEmailPayload {
  const customerName = `${body.customerData.nombre} ${body.customerData.apellido}`.trim();
  const items: OrderLineEmailItem[] = body.items.map((line) => ({
    nombre: line.product.nombre,
    cantidad: line.quantity,
    subtotalFormatted: formatArs(line.subtotal),
    precioUnitarioFormatted: formatArs(line.product.precioLista ?? line.product.precio),
    especificaciones: line.especificaciones,
    bordado: line.bordado,
  }));

  return {
    customerName,
    customerEmail: body.customerData.email,
    customerPhone: body.customerData.telefono,
    shippingSummary: buildShippingSummary(body),
    paymentSummary: buildPaymentSummary(body),
    items,
    itemCount: body.itemCount,
    subtotalFormatted: formatArs(body.subtotal),
    ivaFormatted: formatArs(body.iva),
    totalFormatted: formatArs(body.total),
    status: OrderStatus.PENDING,
    notes: buildNotes(body),
  };
}
