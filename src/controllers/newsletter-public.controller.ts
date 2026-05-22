import type { Request, Response } from 'express';
import { newsletterService } from '../services/newsletter.service';
import { subscribeBodySchema } from '../validation/email.validation';

export async function postSubscribe(req: Request, res: Response): Promise<void> {
  const parsed = subscribeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Email inválido.', errors: parsed.error.flatten() });
    return;
  }
  const result = await newsletterService.subscribe(parsed.data.email);
  if (result.success) {
    res.status(201).json({ success: true, message: result.message, email: result.email });
    return;
  }
  if (result.alreadySubscribed) {
    res.status(409).json({
      success: false,
      alreadySubscribed: true,
      message: result.message,
      email: result.email,
    });
    return;
  }
  res.status(409).json({ success: false, message: result.message });
}