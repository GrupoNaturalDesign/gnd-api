import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { formatArs } from '../lib/money-format';
import { emailService } from '../lib/email/email.service';
import type { OrderEmailPayload } from '../types/email.types';
import { erpOrderStatusBodySchema } from '../validation/email.validation';

function requireErpAuth(req: Request): boolean {
  const secret = process.env.ERP_ORDER_STATUS_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[erp-order-status] Falta ERP_ORDER_STATUS_SECRET en producción.');
      return false;
    }
    return true;
  }
  const key = req.headers['x-api-key'];
  return typeof key === 'string' && key === secret;
}

export async function postOrderStatusFromErp(req: Request, res: Response): Promise<void> {
  if (!requireErpAuth(req)) {
    res.status(401).json({ success: false, error: 'No autorizado.' });
    return;
  }
  const parsed = erpOrderStatusBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Payload inválido',
      details: parsed.error.flatten(),
    });
    return;
  }

  const pedido = await prisma.pedido.findUnique({
    where: { id: parsed.data.pedidoId },
    include: { items: true },
  });
  if (!pedido) {
    res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    return;
  }

  await prisma.pedido.update({
    where: { id: pedido.id },
    data: { estadoErp: parsed.data.status },
  });

  const itemUnits = pedido.items.reduce((acc, it) => acc + Number(it.cantidad), 0);
  const envioLine =
    Number(pedido.costoEnvio) > 0 ? `Costo envío: ${formatArs(Number(pedido.costoEnvio))}` : null;
  const payload: OrderEmailPayload = {
    orderId: pedido.id,
    customerName: pedido.clienteNombre,
    customerEmail: pedido.clienteEmail,
    customerPhone: pedido.clienteTelefono ?? undefined,
    shippingSummary:
      [pedido.formaEnvio ? String(pedido.formaEnvio) : null, pedido.clienteDireccion ?? null, envioLine]
        .filter(Boolean)
        .join(' · ') || undefined,
    paymentSummary: pedido.formaPago ? String(pedido.formaPago) : undefined,
    items: pedido.items.map((it) => ({
      nombre: it.nombre,
      cantidad: Number(it.cantidad),
      subtotalFormatted: formatArs(Number(it.subtotal)),
      precioUnitarioFormatted: formatArs(Number(it.precioUnitario)),
    })),
    itemCount: pedido.cantidadPrendas ?? Math.round(itemUnits),
    subtotalFormatted: formatArs(Number(pedido.subtotal)),
    ivaFormatted: formatArs(Number(pedido.iva)),
    totalFormatted: formatArs(Number(pedido.total)),
    status: parsed.data.status,
    notes: pedido.observaciones ?? undefined,
  };

  const result = await emailService.sendOrderStatusEmail(payload);
  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error ?? 'No se pudo enviar el email al cliente',
      pedidoId: pedido.id,
      estadoErp: parsed.data.status,
    });
    return;
  }

  res.json({
    success: true,
    message: 'Estado actualizado y email enviado',
    pedidoId: pedido.id,
    estadoErp: parsed.data.status,
    messageId: result.messageId,
  });
}
