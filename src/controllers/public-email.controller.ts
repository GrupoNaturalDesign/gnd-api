import type { Request, Response } from 'express';
import { emailService } from '../lib/email/email.service';
import { mapCheckoutBodyToOrderEmailPayload } from '../services/order-email-mapper.service';
import { contactBodySchema, orderConfirmationBodySchema } from '../validation/email.validation';

export async function postContact(req: Request, res: Response): Promise<void> {
  const parsed = contactBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Datos inválidos',
      errors: parsed.error.flatten(),
    });
    return;
  }
  const result = await emailService.sendContactConfirmation({
    email: parsed.data.email,
    empresa: parsed.data.empresa,
    telefono: parsed.data.telefono,
    mensaje: parsed.data.mensaje,
    nombreCompleto: parsed.data.nombreCompleto,
  });
  if (!result.success) {
    res.status(500).json({
      success: false,
      message: result.error ?? 'Error al enviar el email',
    });
    return;
  }
  res.json({
    success: true,
    message: 'Consulta enviada correctamente',
  });
}

export async function postOrderConfirmation(req: Request, res: Response): Promise<void> {
  const secret = process.env.ORDER_CONFIRMATION_EMAIL_SECRET?.trim();
  const provided =
    (typeof req.headers['x-internal-email-secret'] === 'string'
      ? req.headers['x-internal-email-secret']
      : '') || '';
  if (!secret || provided !== secret) {
    res.status(403).json({
      success: false,
      message: 'Endpoint restringido. La confirmacion de pedidos se envia desde el backend o desde admin.',
    });
    return;
  }
  const parsed = orderConfirmationBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Datos inválidos',
      errors: parsed.error.flatten(),
    });
    return;
  }
  const payload = mapCheckoutBodyToOrderEmailPayload(parsed.data);
  payload.source = 'public_compat';
  if (parsed.data.to.trim().toLowerCase() !== payload.customerEmail.trim().toLowerCase()) {
    res.status(400).json({ success: false, message: 'El destinatario no coincide con el email del cliente.' });
    return;
  }
  const result = await emailService.sendOrderStatusEmail(payload);
  void emailService.sendInternalOrderNotification(payload);
  if (!result.success) {
    res.status(500).json({
      success: false,
      message: result.error ?? 'Error al enviar el email',
    });
    return;
  }
  res.json({
    success: true,
    message: 'Emails enviados exitosamente',
    messageId: result.messageId,
  });
}
