import dotenv from 'dotenv';
import { MercadoPagoConfigError } from './mercadopago.errors';

dotenv.config();

export type MercadoPagoMode = 'sandbox' | 'production';

/**
 * Credenciales y modo (sandbox vs producción).
 *
 * Variables:
 * - Producción: NODE_ENV=production y MERCADOPAGO_ENV=production →
 *   `MERCADOPAGO_ACCESS_TOKEN_PROD` o `MERCADOPAGO_ACCESS_TOKEN`
 * - Sandbox / QA: `MERCADOPAGO_ACCESS_TOKEN_TEST`, `MERCADOPAGO_ACCESS_TOKEN_QA` o `MERCADOPAGO_ACCESS_TOKEN`
 *
 * Webhook:
 * - `MP_WEBHOOK_URL`: URL completa del endpoint (ej. `https://dominio.com/api/webhooks/mercadopago`).
 *   En live (`MERCADOPAGO_ENV=production` + `NODE_ENV=production`) debe ser HTTPS.
 * - Si no está definida, en desarrollo se usa `NGROK_URL` + `/api/webhooks/mercadopago`.
 * - Firma: `MERCADOPAGO_WEBHOOK_SECRET` (secreto de la app en el panel MP). En live se exige si
 *   `MP_WEBHOOK_SIGNATURE_REQUIRED=true` (default recomendado en producción).
 * - `MERCADOPAGO_COLLECTOR_ID`: id numérico del cobrador en live (validación opcional pero recomendada).
 */
function isLiveMode(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.MERCADOPAGO_ENV === 'production';
}

function trimBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function resolveAccessToken(): string {
  if (isLiveMode()) {
    return (
      process.env.MERCADOPAGO_ACCESS_TOKEN_PROD?.trim() ||
      process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
      ''
    );
  }
  return (
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN_QA?.trim() ||
    process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ||
    ''
  );
}

function parseCollectorId(): number | undefined {
  const raw = process.env.MERCADOPAGO_COLLECTOR_ID?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function webhookSignatureRequired(): boolean {
  if (!isLiveMode()) return false;
  const v = process.env.MP_WEBHOOK_SIGNATURE_REQUIRED?.trim().toLowerCase();
  if (v === 'false' || v === '0') return false;
  return true;
}

export const mercadoPagoConfig = {
  baseUrl: 'https://api.mercadopago.com' as const,

  isLiveMode,

  getMode(): MercadoPagoMode {
    return isLiveMode() ? 'production' : 'sandbox';
  },

  getAccessToken(): string {
    return resolveAccessToken();
  },

  isConfigured(): boolean {
    return this.getAccessToken().length > 0;
  },

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new MercadoPagoConfigError(
        'Mercado Pago no configurado: sandbox → MERCADOPAGO_ACCESS_TOKEN_TEST o MERCADOPAGO_ACCESS_TOKEN_QA; producción → MERCADOPAGO_ACCESS_TOKEN_PROD o MERCADOPAGO_ACCESS_TOKEN.'
      );
    }
  },

  /** Secreto para validar firma `x-signature` de webhooks. */
  getWebhookSecret(): string | undefined {
    const s = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
    return s && s.length > 0 ? s : undefined;
  },

  /** En live, si no hay secreto y esto es true, falla al arrancar el procesamiento del webhook. */
  isWebhookSignatureRequired(): boolean {
    return webhookSignatureRequired();
  },

  getExpectedCollectorId(): number | undefined {
    return parseCollectorId();
  },

  /**
   * URL completa del webhook (POST). `MP_WEBHOOK_URL` tiene prioridad; si no, `NGROK_URL` + path en no-live.
   */
  resolveNotificationUrl(): string {
    const explicit = trimBaseUrl(process.env.MP_WEBHOOK_URL?.trim() ?? '');
    if (explicit) {
      this.assertWebhookUrlAllowed(explicit);
      return explicit;
    }

    if (isLiveMode()) {
      throw new MercadoPagoConfigError(
        'MP_WEBHOOK_URL es obligatoria en producción live (HTTPS). Ej: https://tudominio.com/api/webhooks/mercadopago'
      );
    }

    const ngrok = trimBaseUrl(process.env.NGROK_URL?.trim() ?? '');
    if (!ngrok) {
      throw new MercadoPagoConfigError(
        'Configurá MP_WEBHOOK_URL (recomendado) o NGROK_URL para notification_url del checkout Mercado Pago.'
      );
    }
    return `${ngrok}/api/webhooks/mercadopago`;
  },

  assertWebhookUrlAllowed(url: string): void {
    if (!/^https:\/\//i.test(url) && isLiveMode()) {
      throw new MercadoPagoConfigError(
        'MP_WEBHOOK_URL debe usar HTTPS en producción live (MERCADOPAGO_ENV=production).'
      );
    }
  },

  /** Minutos hasta `expiresAt` en pedidos `pendiente_pago` (checkout MP). */
  getCheckoutMpPendingTimeoutMinutes(): number {
    const raw = process.env.CHECKOUT_MP_EXPIRES_MINUTES?.trim();
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 5 && n <= 7 * 24 * 60) return Math.floor(n);
    return 120;
  },
};
