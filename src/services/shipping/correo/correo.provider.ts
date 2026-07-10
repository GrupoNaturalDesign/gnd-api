import type { EmpresaEnvioConfig } from '@prisma/client';
import { shippingLogger } from '../../../lib/shipping-logger';
import { CorreoAuth, type CorreoAccountCredentials } from './correo.auth';
import {
  correoAccountService,
  MICORREO_NOT_CONFIGURED_MSG,
} from './correo-account.service';
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
  ShippingConfigError,
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
import { normalizeMicorreoPostalCode, resolveCorreoOriginFromConfig } from './correo-postal.util';
import type { FetchFn, FetchRequestInit, FetchResponse } from '../../../types/fetch.types';

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
  if (status === 400 || status === 402 || status === 406) {
    return new ShippingValidationError(msg);
  }
  return new ShippingHttpError(msg, status, body);
}

function fetchFailureDetails(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) return { message: String(e) };
  const cause = (e as Error & { cause?: unknown }).cause;
  const details: Record<string, unknown> = {
    name: e.name,
    message: e.message,
  };
  if (cause instanceof Error) {
    details.cause = {
      name: cause.name,
      message: cause.message,
      code: (cause as Error & { code?: unknown }).code,
    };
  } else if (cause != null) {
    details.cause = String(cause);
  }
  return details;
}

function mapFetchFailure(e: unknown, path: string): ShippingHttpError {
  const details = fetchFailureDetails(e);
  const message =
    typeof details.message === 'string' && details.message.trim()
      ? `MiCorreo: ${details.message}`
      : 'MiCorreo: error de red consultando proveedor';
  return new ShippingHttpError(message, 502, { path, ...details });
}

function isFetchFailureError(e: unknown): e is ShippingHttpError {
  return (
    e instanceof ShippingHttpError &&
    e.status === 502 &&
    e.body != null &&
    typeof e.body === 'object' &&
    !Array.isArray(e.body) &&
    (e.body as Record<string, unknown>).name === 'TypeError'
  );
}

function extractTrackingNumberFromImportResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const candidates = [
    o.shippingId,
    o.trackingNumber,
    o.numeroDeEnvio,
    o.numero_envio,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
    if (typeof c === 'number' && Number.isFinite(c)) return String(c);
  }
  return null;
}

export class CorreoProvider implements ShippingProvider {
  readonly providerName: ShippingProviderName = 'correo';

  private auth: CorreoAuth | null = null;

  constructor(
    private readonly envioConfig: EmpresaEnvioConfig,
    private readonly correoEnv: CorreoEnv,
    private readonly fetchImpl: FetchFn
  ) {}

  private get empresaId(): number {
    return this.envioConfig.empresaId;
  }

  private async resolveCustomerId(): Promise<string> {
    const cached = this.envioConfig.correoCustomerId?.trim();
    const status = this.envioConfig.correoAccountStatus?.trim();
    if (cached && status === 'active') {
      return cached;
    }
    const creds = correoAccountService.resolveAccountCredentials(this.envioConfig);
    if (creds?.email && creds.password) {
      const auth = new CorreoAuth({
        env: this.correoEnv,
        fetchImpl: this.fetchImpl,
        account: { email: creds.email, password: creds.password },
      });
      const id = await auth.getCustomerId();
      await correoAccountService
        .persistValidatedCustomerId(this.empresaId, id)
        .catch(() => undefined);
      return id;
    }
    return correoAccountService.ensureMicorreoCustomerId(this.empresaId);
  }

  private async buildAuth(): Promise<CorreoAuth> {
    const customerId = await this.resolveCustomerId();
    const creds = correoAccountService.resolveAccountCredentials(this.envioConfig);
    if (!creds) {
      throw new ShippingValidationError(MICORREO_NOT_CONFIGURED_MSG);
    }
    const account: CorreoAccountCredentials = {
      email: creds.email,
      password: creds.password,
      customerId,
    };
    this.auth = new CorreoAuth({
      env: this.correoEnv,
      fetchImpl: this.fetchImpl,
      account,
    });
    return this.auth;
  }

  private async getAuth(): Promise<CorreoAuth> {
    if (this.auth) return this.auth;
    return this.buildAuth();
  }

  private timeoutSignal(): AbortSignal {
    const ms = getCorreoTimeoutMs();
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
  }

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
    const auth = await this.getAuth();
    const customerId = await auth.getCustomerId();
    const normalizedInput: CorreoQuoteInput = {
      ...input,
      postalCodeOrigin: normalizeMicorreoPostalCode(input.postalCodeOrigin),
      postalCodeDestination: normalizeMicorreoPostalCode(input.postalCodeDestination),
    };
    const body = buildRatesRequestBody(customerId, normalizedInput);
    const { status, data } = await this.requestJson('POST', CORREO_PATHS.rates, body);
    const quotes = mapRatesResponse(data);
    if (quotes.length === 0) {
      const suffix =
        customerId.length <= 4 ? '****' : `…${customerId.slice(-4)}`;
      shippingLogger.warn('MiCorreo rates vacío', {
        httpStatus: status,
        customerIdSuffix: suffix,
        postalCodeOrigin: normalizedInput.postalCodeOrigin,
        postalCodeDestination: normalizedInput.postalCodeDestination,
        deliveredType: input.deliveredType ?? null,
        responsePreview:
          data != null && typeof data === 'object'
            ? JSON.stringify(data).slice(0, 600)
            : String(data).slice(0, 600),
      });
    }
    return quotes;
  }

  async validateCredentials(): Promise<void> {
    if (isCorreoMock()) return;
    try {
      this.auth = null;
      const auth = await this.getAuth();
      await auth.validateCredentials();
    } catch (e: unknown) {
      if (
        e instanceof ShippingConfigError ||
        e instanceof ShippingHttpError ||
        e instanceof ShippingValidationError
      ) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new ShippingValidationError(`Credenciales MiCorreo inválidas: ${msg}`);
    }
  }

  async importDryRun(input: CreateShippingOrderInput): Promise<unknown> {
    if (isCorreoMock()) {
      return { createdAt: new Date().toISOString(), mock: true };
    }
    const auth = await this.getAuth();
    const customerId = await auth.getCustomerId();
    const origin = resolveCorreoOriginFromConfig(this.envioConfig);
    const body = mapCreateOrderToMicorreoImport(
      input,
      customerId,
      this.envioConfig.correoSenderData,
      origin,
      { extOrderId: `TEST-${Date.now()}` }
    );
    const { data } = await this.requestJson('POST', CORREO_PATHS.shippingImport, body);
    return data;
  }

  async getCustomerIdSuffixForLogs(): Promise<string> {
    const auth = await this.getAuth();
    const id = await auth.getCustomerId();
    return id.length <= 4 ? '****' : `…${id.slice(-4)}`;
  }

  async createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    if (isCorreoMock()) {
      const tn = String(input.pedidoId);
      shippingLogger.info('MiCorreo createOrder mock', { pedidoId: input.pedidoId });
      return { trackingNumber: tn, provider: 'correo' };
    }
    const auth = await this.getAuth();
    const customerId = await auth.getCustomerId();
    const origin = resolveCorreoOriginFromConfig(this.envioConfig);
    const body = mapCreateOrderToMicorreoImport(
      input,
      customerId,
      this.envioConfig.correoSenderData,
      origin
    );
    const { data } = await this.requestJson('POST', CORREO_PATHS.shippingImport, body);
    const trackingNumber = extractTrackingNumberFromImportResponse(data);
    if (!trackingNumber) {
      shippingLogger.error('MiCorreo orden importada sin trackingNumber', {
        pedidoId: input.pedidoId,
        response: data,
      });
      throw new ShippingHttpError(
        'MiCorreo importo la orden pero no devolvio numero de seguimiento',
        502,
        data
      );
    }
    shippingLogger.info('MiCorreo orden importada', {
      pedidoId: input.pedidoId,
      trackingResolved: true,
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
    const auth = await this.getAuth();
    const customerId = await auth.getCustomerId();
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

    const doFetch = async (): Promise<FetchResponse> => {
      const auth = await this.getAuth();
      const token = await auth.getValidToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const init: FetchRequestInit = {
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
      const pathOnly = pathWithQuery.split('?')[0] ?? pathWithQuery;
      shippingLogger.info('MiCorreo request start', {
        method,
        path: pathOnly,
      });
      let res: FetchResponse;
      try {
        res = await this.fetchImpl(url, init);
      } catch (e: unknown) {
        shippingLogger.error('MiCorreo fetch error', {
          method,
          path: pathOnly,
          details: fetchFailureDetails(e),
        });
        throw mapFetchFailure(e, pathOnly);
      }
      const latencyMs = Date.now() - started;
      shippingLogger.info('MiCorreo request end', {
        method,
        path: pathOnly,
        status: res.status,
        latencyMs,
      });
      return res;
    };

    let res: FetchResponse;
    try {
      res = await doFetch();
    } catch (e: unknown) {
      if (!isFetchFailureError(e)) throw e;
      shippingLogger.info('MiCorreo request retry after fetch error', {
        method,
        path: pathWithQuery.split('?')[0] ?? pathWithQuery,
      });
      res = await doFetch();
    }
    let text = await res.text();
    let data = parseJsonUnknown(text);

    if (res.status === 401 || res.status === 406) {
      this.auth?.invalidateSession();
      this.auth = null;
      if (res.status === 406) {
        await correoAccountService.syncMicorreoAccount(this.empresaId).catch(() => undefined);
      }
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
