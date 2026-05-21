import type { Prisma } from '@prisma/client';
import { shippingLogger } from '../../../lib/shipping-logger';
import { CorreoAuth } from './correo.auth';
import {
  CORREO_PATHS,
  type CorreoEnv,
  getCorreoBaseUrlForEnv,
  getCorreoTimeoutMs,
  isCorreoMock,
  resolveCorreoEnv,
} from './correo.config';
import type { ShippingProvider } from '../shipping.provider';
import type {
  AgencyFilters,
  CreateShippingOrderInput,
  ShippingAgency,
  ShippingLabel,
  ShippingLabelContext,
  ShippingOrderResult,
  ShippingProviderName,
  ShippingTrackingResult,
} from '../shipping.types';
import {
  ShippingHttpError,
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from '../shipping.errors';
import type { CorreoQuoteInput, CorreoShippingQuote } from './correo.types';
import { getProvinceCode } from './correo.types';
import {
  buildRatesRequestBody,
  filterAgenciesByQuery,
  mapCorreoAgenciesResponse,
  mapCorreoTrackingResponseToResults,
  mapCreateOrderToMicorreoImport,
  mapRatesResponse,
} from './correo.mapper';

function parseJsonUnknown(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function messageFromBody(body: unknown): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const m = o.message ?? o.error ?? o.detail ?? o.description;
    if (typeof m === 'string') return m;
  }
  return 'Error HTTP MiCorreo';
}

function mapStatusToError(status: number, body: unknown): Error {
  const msg = messageFromBody(body);
  if (status === 400 || status === 402) {
    return new ShippingValidationError(msg);
  }
  return new ShippingHttpError(msg, status, body);
}

function extractTrackingNumberFromImportResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const candidates = [
    o.shippingId,
    o.trackingNumber,
    o.numeroDeEnvio,
    o.numero_envio,
    o.id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return null;
}

export class CorreoProvider implements ShippingProvider {
  readonly providerName: ShippingProviderName = 'correo';

  private readonly auth: CorreoAuth;

  constructor(
    private readonly correoSenderData: Prisma.JsonValue | null,
    private readonly correoEnv: CorreoEnv,
    private readonly fetchImpl: typeof fetch
  ) {
    this.auth = new CorreoAuth(correoEnv, fetchImpl);
  }

  private timeoutSignal(): AbortSignal {
    const ms = getCorreoTimeoutMs();
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }

  /**
   * Cotización MiCorreo (no forma parte de `ShippingProvider`; usada por rutas de test y herramientas).
   */
  async getQuote(input: CorreoQuoteInput): Promise<CorreoShippingQuote[]> {
    if (isCorreoMock()) {
      return [
        {
          serviceCode: 'MOCK',
          serviceName: 'Mock MiCorreo',
          price: 1000,
          currency: 'ARS',
        },
      ];
    }
    const customerId = await this.auth.getCustomerId();
    const body = buildRatesRequestBody(customerId, input);
    const { data } = await this.requestJson('POST', CORREO_PATHS.rates, body);
    return mapRatesResponse(data);
  }

  async validateCredentials(): Promise<void> {
    if (isCorreoMock()) return;
    try {
      await this.auth.validateCredentials();
    } catch (e: unknown) {
      if (e instanceof ShippingHttpError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new ShippingValidationError(`Credenciales MiCorreo inválidas: ${msg}`);
    }
  }

  /**
   * POST /shipping/import con extOrderId TEST-{timestamp} (QA / verificación de mapeo).
   */
  async importDryRun(input: CreateShippingOrderInput): Promise<unknown> {
    if (isCorreoMock()) {
      return { createdAt: new Date().toISOString(), mock: true };
    }
    const customerId = await this.auth.getCustomerId();
    const body = mapCreateOrderToMicorreoImport(input, customerId, this.correoSenderData, {
      extOrderId: `TEST-${Date.now()}`,
    });
    const { data } = await this.requestJson('POST', CORREO_PATHS.shippingImport, body);
    return data;
  }

  /** Últimos 4 caracteres del customerId (logs / ping). */
  async getCustomerIdSuffixForLogs(): Promise<string> {
    const id = await this.auth.getCustomerId();
    return id.length <= 4 ? '****' : `…${id.slice(-4)}`;
  }

  async createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    if (isCorreoMock()) {
      const tn = String(input.pedidoId);
      shippingLogger.info('MiCorreo createOrder mock', { pedidoId: input.pedidoId });
      return { trackingNumber: tn, provider: 'correo' };
    }
    const customerId = await this.auth.getCustomerId();
    const body = mapCreateOrderToMicorreoImport(input, customerId, this.correoSenderData);
    const { data } = await this.requestJson('POST', CORREO_PATHS.shippingImport, body);
    const trackingNumber = extractTrackingNumberFromImportResponse(data) ?? String(input.pedidoId);
    shippingLogger.info('MiCorreo orden importada', {
      pedidoId: input.pedidoId,
      trackingResolved: trackingNumber !== String(input.pedidoId),
    });
    return { trackingNumber, provider: 'correo' };
  }

  async cancelOrder(_trackingNumber: string): Promise<void> {
    void _trackingNumber;
    throw new ShippingMethodNotSupportedError(
      'MiCorreo no provee cancelación vía API.'
    );
  }

  async getLabel(
    _trackingNumber: string,
    _context?: ShippingLabelContext
  ): Promise<ShippingLabel> {
    void _trackingNumber;
    void _context;
    throw new ShippingMethodNotSupportedError(
      'MiCorreo no provee etiquetas vía API. Descargalas desde el portal web.'
    );
  }

  async getTracking(trackingNumbers: string[]): Promise<ShippingTrackingResult[]> {
    if (trackingNumbers.length === 0) return [];
    if (isCorreoMock()) {
      return trackingNumbers.map((tn) => ({
        trackingNumber: tn,
        provider: 'correo',
        events: [],
      }));
    }
    const tn = trackingNumbers[0] ?? '';
    const { data } = await this.requestJson(
      'GET',
      CORREO_PATHS.shippingTracking,
      { shippingId: tn },
      { useGetBody: true }
    );
    const mapped = mapCorreoTrackingResponseToResults(data, trackingNumbers);
    return mapped.length > 0
      ? mapped
      : trackingNumbers.map((t) => ({
          trackingNumber: t,
          provider: 'correo',
          events: [],
        }));
  }

  async getAgencies(filters: AgencyFilters): Promise<ShippingAgency[]> {
    if (isCorreoMock()) {
      return [];
    }
    const customerId = await this.auth.getCustomerId();
    let provinceCode = '';
    if (filters.stateId != null && filters.stateId !== '') {
      const s = filters.stateId.trim();
      provinceCode =
        s.length === 1 && /[a-zA-Z]/.test(s)
          ? s.toUpperCase()
          : getProvinceCode(s) ?? s;
    }
    if (!provinceCode) {
      throw new ShippingValidationError(
        'Indique stateId (código de provincia A–Z o nombre) para listar sucursales MiCorreo'
      );
    }
    const qs = new URLSearchParams({
      customerId,
      provinceCode,
      services: 'package_reception',
    });
    const { data } = await this.requestJson(
      'GET',
      `${CORREO_PATHS.agencies}?${qs.toString()}`
    );
    const list = mapCorreoAgenciesResponse(data);
    return filterAgenciesByQuery(list, filters);
  }

  private async requestJson(
    method: 'GET' | 'POST',
    pathWithQuery: string,
    body?: unknown,
    opts?: { useGetBody?: boolean }
  ): Promise<{ status: number; data: unknown }> {
    const baseUrl = getCorreoBaseUrlForEnv(this.correoEnv);
    const url = pathWithQuery.startsWith('http')
      ? pathWithQuery
      : `${baseUrl}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;

    const doFetch = async (): Promise<Response> => {
      const token = await this.auth.getValidToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const init: RequestInit = {
        method,
        headers,
        signal: this.timeoutSignal(),
      };
      if (body !== undefined) {
        if (method === 'GET' && opts?.useGetBody) {
          init.body = JSON.stringify(body);
        } else if (method === 'POST') {
          init.body = JSON.stringify(body);
        }
      }
      const started = Date.now();
      const pathOnly = pathWithQuery.split('?')[0];
      shippingLogger.info('MiCorreo request start', {
        method,
        path: pathOnly,
      });
      const res = await this.fetchImpl(url, init);
      const latencyMs = Date.now() - started;
      shippingLogger.info('MiCorreo request end', {
        method,
        path: pathOnly,
        status: res.status,
        latencyMs,
      });
      return res;
    };

    let res = await doFetch();
    let text = await res.text();
    let data = parseJsonUnknown(text);

    if (res.status === 401) {
      this.auth.invalidateToken();
      res = await doFetch();
      text = await res.text();
      data = parseJsonUnknown(text);
    }

    if (!res.ok) {
      shippingLogger.error('MiCorreo HTTP error', {
        status: res.status,
        path: pathWithQuery.split('?')[0],
      });
      throw mapStatusToError(res.status, data);
    }
    return { status: res.status, data };
  }
}

export function getCorreoEnvLabel(): string {
  return resolveCorreoEnv();
}
