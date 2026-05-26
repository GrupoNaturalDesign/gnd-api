// src/routes/webhook-mp.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { webhookMpController } from '../controllers/webhook-mp.controller';

const router = Router();

const mpWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', mpWebhookLimiter, (req, res) => {
  void webhookMpController.recibirWebhook(req, res);
});

export default router;
