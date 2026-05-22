import { randomUUID } from 'crypto';
import { mercadoPagoConfig } from './mercadopago.config';
import { MercadoPagoApiError } from './mercadopago.errors';
import type {
  MercadoPagoCreatePreferenceBody,
  MercadoPagoPayment,
  MercadoPagoPaymentSearchResponse,
  MercadoPagoPreferenceResponse,
} from './mercadopago.types';
import type { FetchFn, FetchRequestInit } from '../../types/fetch.types';

type ConfigLike = {
  baseUrl: string;
  getAccessToken: () => string;
  assertConfigured: () => void;
};

function parseErrorMessage(body: unknown): string {
  if (body == null || typeof body !== 'object') {
    return 'Error desconocido';
  }
  const o = body as Record<string, unknown>;
  const msg = o.message;
  const err = o.error;
  if (typeof msg === 'string' && msg.length > 0) return msg;
  if (typeof err === 'string' && err.length > 0) return err;
  return 'Error de Mercado Pago';
}

export interface MercadoPagoClientDeps {
  fetchImpl?: FetchFn;
  config?: ConfigLike;
}

/**
 * Cliente HTTP mínimo para Checkout API y Pagos (preferencias, consulta de pago, búsqueda).
 * Sin webhooks ni mapeo a modelos de dominio.
 */
export class MercadoPagoClient {
  constructor(private readonly deps: MercadoPagoClientDeps = {}) {}

  private get cfg(): ConfigLike {
    return this.deps.config ?? mercadoPagoConfig;
  }

  private get fetchFn(): FetchFn {
    return (this.deps.fetchImpl ?? globalThis.fetch.bind(globalThis)) as FetchFn;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      body?: unknown;
      idempotentPost?: boolean;
      /** Si se omite con idempotentPost, se genera UUID. */
      idempotencyKey?: string;
    }
  ): Promise<T> {
    this.cfg.assertConfigured();
    const token = this.cfg.getAccessToken();
    const url = `${this.cfg.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (method === 'POST' && options?.idempotentPost) {
      headers['X-Idempotency-Key'] = options.idempotencyKey ?? randomUUID();
    }

    const init: FetchRequestInit = {
      method,
      headers,
    };

    if (options?.body !== undefined && (method === 'POST' || method === 'PUT')) {
      init.body = JSON.stringify(options.body);
    }

    if (process.env.NODE_ENV !== 'production' && path.includes('/preferences')) {
      console.log(`[MercadoPagoClient] ${method} ${path}`);
    }

    const res = await this.fetchFn(url, init);
    const text = await res.text();

    let data: unknown;
    if (text.length === 0) {
      data = null;
    } else {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        throw new MercadoPagoApiError(
          `Respuesta no JSON (${res.status})`,
          res.status,
          text
        );
      }
    }

    if (!res.ok) {
      throw new MercadoPagoApiError(parseErrorMessage(data), res.status, data);
    }

    return data as T;
  }

  /** POST /checkout/preferences */
  async createPreference(
    body: MercadoPagoCreatePreferenceBody,
    idempotencyKey?: string
  ): Promise<MercadoPagoPreferenceResponse> {
    return this.request<MercadoPagoPreferenceResponse>('POST', '/checkout/preferences', {
      body,
      idempotentPost: true,
      idempotencyKey,
    });
  }

  /** GET /checkout/preferences/:id */
  async getPreference(preferenceId: string): Promise<MercadoPagoPreferenceResponse> {
    const id = encodeURIComponent(preferenceId);
    return this.request<MercadoPagoPreferenceResponse>('GET', `/checkout/preferences/${id}`);
  }

  /** GET /v1/payments/:id */
  async getPayment(paymentId: string | number): Promise<MercadoPagoPayment> {
    const id = encodeURIComponent(String(paymentId));
    return this.request<MercadoPagoPayment>('GET', `/v1/payments/${id}`);
  }

  /** GET /v1/payments/search?external_reference=... */
  async searchPaymentsByExternalReference(
    externalReference: string
  ): Promise<MercadoPagoPayment[]> {
    const q = encodeURIComponent(externalReference);
    const res = await this.request<MercadoPagoPaymentSearchResponse>(
      'GET',
      `/v1/payments/search?external_reference=${q}`
    );
    return res.results ?? [];
  }
}

/** Instancia por defecto (misma config que `mercadopagoConfig`). */
export const mercadoPagoClient = new MercadoPagoClient();
