import type { Request, Response } from 'express';
import { unsubscribeService } from '../lib/email/unsubscribe.service';
import { paramAsString } from '../utils/http-param.util';

export async function getUnsubscribe(req: Request, res: Response): Promise<void> {
  const token = paramAsString(req.params.token);
  if (!token || token.length < 10) {
    res.status(400).json({
      success: false,
      message: 'Token inválido.',
    });
    return;
  }
  const result = await unsubscribeService.unsubscribe(token);
  if (!result.success) {
    res.status(404).json({
      success: false,
      message: result.message,
    });
    return;
  }
  res.json({
    success: true,
    message: result.message,
  });
}