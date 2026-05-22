import type { Request, Response } from 'express';
import { emailService } from '../lib/email/email.service';
import { newsletterService } from '../services/newsletter.service';
import { emailLogsQuerySchema, newsletterSendBodySchema, subscribersQuerySchema } from '../validation/email.validation';

export async function postNewsletterSend(req: Request, res: Response): Promise<void> {
  const parsed = newsletterSendBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Datos inválidos',
      details: parsed.error.flatten(),
    });
    return;
  }

  const recipientList =
    parsed.data.recipientList ?? (await newsletterService.getActiveEmails());

  const result = await emailService.sendNewsletter({
    subject: parsed.data.subject,
    htmlBody: parsed.data.content,
    recipientList,
  });
  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error ?? 'Error al enviar newsletter',
    });
    return;
  }
  res.json({
    success: true,
    message: 'Newsletter enviado',
    messageId: result.messageId,
    recipients: recipientList.length,
    ...(result.error ? { warning: result.error } : {}),
  });
}

export async function getSubscribers(req: Request, res: Response): Promise<void> {
  const parsed = subscribersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Parámetros inválidos', details: parsed.error.flatten() });
    return;
  }
  const result = await newsletterService.getActiveSubscribers(parsed.data.page, parsed.data.limit);
  res.json(result);
}

export async function getEmailLogs(req: Request, res: Response): Promise<void> {
  const parsed = emailLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Parámetros inválidos', details: parsed.error.flatten() });
    return;
  }
  const result = await newsletterService.getEmailLogs({
    page: parsed.data.page,
    limit: parsed.data.limit,
    type: parsed.data.type,
    status: parsed.data.status,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  res.json(result);
}
