// src/controllers/webhook-mp.controller.ts
import { Request, Response } from 'express';
import { mercadoPagoConfig } from '../services/mercadopago/mercadopago.config';
import {
  buildWebhookDedupeKey,
  extractMercadoPagoPaymentId,
  procesarWebhookMercadoPago,
} from '../services/mp-checkout.service';
import { finishMpWebhookLog, tryBeginMpWebhook } from '../services/mp-webhook-log.service';
import {
  extractMercadoPagoWebhookDataId,
  verifyMercadoPagoWebhookSignature,
} from '../utils/mercadopago-webhook-signature';

function normalizeQuery(q: Request['query']): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === 'string') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      const first = v[0];
      out[k] = typeof first === 'string' ? first : undefined;
    }
  }
  return out;
}

function normalizeHeaders(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (typeof v === 'string') {
      out[key] = v;
    } else if (Array.isArray(v) && typeof v[0] === 'string') {
      out[key] = v[0];
    }
  }
  return out;
}

function extractMercadoPagoWebhookTopic(
  query: Record<string, string | undefined>,
  body: unknown
): string | undefined {
  if (typeof query.topic === 'string' && query.topic.length > 0) return query.topic;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.type === 'string' && b.type.length > 0) return b.type;
    if (typeof b.topic === 'string' && b.topic.length > 0) return b.topic;
  }
  return undefined;
}

export class WebhookMpController {
  /** POST /api/webhooks/mercadopago — sin auth; valida firma en live; 200 idempotente. */
  recibirWebhook(req: Request, res: Response): void {
    const query = normalizeQuery(req.query);
    const headers = normalizeHeaders(req);
    const paymentId = extractMercadoPagoPaymentId(req.body, query);
    const dedupeKey = buildWebhookDedupeKey(headers, req.body, paymentId);

    const secret = mercadoPagoConfig.getWebhookSecret();
    if (mercadoPagoConfig.isWebhookSignatureRequired() && !secret) {
      res.status(503).json({
        success: false,
        error: 'MERCADOPAGO_WEBHOOK_SECRET no configurado',
      });
      return;
    }

    if (secret && mercadoPagoConfig.isWebhookSignatureRequired()) {
      const dataId =
        extractMercadoPagoWebhookDataId(query, req.body) ?? paymentId ?? undefined;
      if (
        !dataId ||
        !verifyMercadoPagoWebhookSignature({
          xSignature: headers['x-signature'],
          xRequestId: headers['x-request-id'],
          dataId,
          secret,
        })
      ) {
        res.status(401).json({ success: false, error: 'Firma de webhook inválida' });
        return;
      }
    }

    const topic = extractMercadoPagoWebhookTopic(query, req.body);
    if (topic === 'merchant_order') {
      res.status(200).json({ success: true, message: 'ignored_merchant_order' });
      return;
    }

    void (async () => {
      try {
        const begin = await tryBeginMpWebhook(dedupeKey, paymentId, null);
        if (begin === 'duplicate') {
          res.status(200).json({ success: true, message: 'duplicate' });
          return;
        }

        res.status(200).json({ success: true, message: 'ok' });

        setImmediate(() => {
          void (async () => {
            try {
              const result = await procesarWebhookMercadoPago(req.body, query);
              await finishMpWebhookLog(dedupeKey, {
                outcome: result.procesado
                  ? 'processed'
                  : result.pedidoId != null
                    ? 'skipped'
                    : 'skipped',
                mpStatus: result.paymentStatus,
                pedidoId: result.pedidoId,
                paymentId,
                detail: result.alreadyProcessed ? 'already_processed' : undefined,
              });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error('[WebhookMP] Error procesando:', msg);
              try {
                await finishMpWebhookLog(dedupeKey, {
                  outcome: 'error',
                  paymentId,
                  detail: msg,
                });
              } catch (e2) {
                console.error('[WebhookMP] Error actualizando log:', e2);
              }
            }
          })();
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: msg });
        } else {
          console.error('[WebhookMP] Error tras responder:', msg);
        }
      }
    })();
  }
}

export const webhookMpController = new WebhookMpController();
