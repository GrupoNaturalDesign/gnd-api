import { createHmac, timingSafeEqual } from 'crypto';

export interface MercadoPagoWebhookSignatureInput {
  /** Valor crudo del header `x-signature` (ej. `ts=...,v1=...`). */
  xSignature: string | undefined;
  /** `x-request-id` */
  xRequestId: string | undefined;
  /** `data.id` de la query (id del recurso notificado). */
  dataId: string | undefined;
  /** Secreto de firma de la aplicación (panel MP). */
  secret: string;
  /** Tolerancia máxima del reloj en segundos (default 300). */
  maxSkewSeconds?: number;
}

function parseSignatureParts(xSignature: string): { ts: string; v1: string } | null {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of xSignature.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'v1') v1 = value;
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

function hexEqualsSafe(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verifica la firma HMAC-SHA256 de notificaciones Mercado Pago.
 * @see https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoWebhookSignature(input: MercadoPagoWebhookSignatureInput): boolean {
  const { xSignature, xRequestId, dataId, secret, maxSkewSeconds = 300 } = input;
  if (!xSignature || !xRequestId || !dataId || !secret) return false;

  const parts = parseSignatureParts(xSignature);
  if (!parts) return false;

  const tsNum = Number(parts.ts);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > maxSkewSeconds) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return hexEqualsSafe(expected.toLowerCase(), parts.v1.toLowerCase());
}

/** Lee `data.id` de query (clave literal `data.id`), IPN legacy `?id=` o `body.data.id`. */
export function extractMercadoPagoWebhookDataId(
  query: Record<string, string | undefined>,
  body?: unknown
): string | undefined {
  const raw = query['data.id'];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  const legacyId = query.id;
  if (typeof legacyId === 'string' && legacyId.length > 0) return legacyId;
  if (body && typeof body === 'object') {
    const d = (body as Record<string, unknown>).data;
    if (d && typeof d === 'object' && 'id' in d) {
      const id = (d as Record<string, unknown>).id;
      if (id != null && (typeof id === 'string' || typeof id === 'number')) return String(id);
    }
  }
  return undefined;
}
