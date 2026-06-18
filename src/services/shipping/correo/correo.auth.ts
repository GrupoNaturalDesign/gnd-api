import { shippingLogger } from '../../../lib/shipping-logger';
import type { FetchFn } from '../../../types/fetch.types';
import {
  CORREO_PATHS,
  getCorreoBaseUrlForEnv,
  getCorreoCustomerIdOverride,
  getCorreoTimeoutMs,
  loadCorreoCredentials,
  loadCorreoValidateEmail,
  type CorreoEnv,
} from './correo.config';

function basicAuthHeader(username: string, password: string): string {
  const raw = `${username}:${password}`;
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(raw, 'utf8').toString('base64')
      : btoa(raw);
  return `Basic ${b64}`;
}

function parseExpiresMs(expires: string): number {
  const t = Date.parse(expires);
  if (!Number.isFinite(t)) {
    return Date.now() + 3600_000;
  }
  return t;
}

function redactCustomerId(id: string): string {
  if (id.length <= 4) return '****';
  return `…${id.slice(-4)}`;
}

/**
 * Token JWT vía POST /token (Basic) y customerId vía POST /users/validate.
 * Cache por instancia; sin loguear tokens ni customerId completo.
 */
export class CorreoAuth {
  private token: string | null = null;
  /** epoch ms - 60s margen */
  private tokenValidUntilMs = 0;
  private customerId: string | null = null;
  private customerIdInFlight: Promise<string> | null = null;

  constructor(
    private readonly env: CorreoEnv,
    private readonly fetchImpl: FetchFn
  ) {}

  private get baseUrl(): string {
    return getCorreoBaseUrlForEnv(this.env);
  }

  private getCredentials(): { username: string; password: string } {
    try {
      return loadCorreoCredentials(this.env);
    } catch (e) {
      throw new Error(`loadCorreoCredentials: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private timeoutSignal(): AbortSignal {
    const ms = getCorreoTimeoutMs();
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
  }

  async getCustomerId(): Promise<string> {
    const override = getCorreoCustomerIdOverride();
    if (override) {
      this.customerId = override;
      shippingLogger.info('MiCorreo customerId desde CORREO_CUSTOMER_ID', {
        customerIdSuffix: redactCustomerId(override),
      });
      return override;
    }
    if (this.customerId != null) return this.customerId;
    if (!this.customerIdInFlight) {
      this.customerIdInFlight = this.fetchCustomerIdFromApi().finally(() => {
        this.customerIdInFlight = null;
      });
    }
    return this.customerIdInFlight;
  }

  private async fetchCustomerIdFromApi(): Promise<string> {
    /** Doc MiCorreo: /users/validate requiere Bearer; sin él la API responde 401 "Header List is null or empty". */
    const tok = await this.getValidToken();
    const { password } = this.getCredentials();
    const email = loadCorreoValidateEmail(this.env);
    const url = `${this.baseUrl}${CORREO_PATHS.usersValidate}`;
    const started = Date.now();
    shippingLogger.info('MiCorreo request start', {
      method: 'POST',
      path: CORREO_PATHS.usersValidate,
    });
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: this.timeoutSignal(),
    });
    const text = await res.text();
    const latencyMs = Date.now() - started;
    shippingLogger.info('MiCorreo request end', {
      method: 'POST',
      path: CORREO_PATHS.usersValidate,
      status: res.status,
      latencyMs,
    });
    let data: unknown = {};
    try {
      data = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const hint =
        res.status === 406
          ? ' Revisá CORREO_EMAIL_QA/CORREO_EMAIL (email del portal MiCorreo, no el usuario API). Opcional: CORREO_CUSTOMER_ID.'
          : '';
      throw new Error(`users/validate ${res.status}: ${text.slice(0, 500)}${hint}`);
    }
    const o = data as Record<string, unknown>;
    const cid =
      typeof o.customerId === 'string'
        ? o.customerId
        : typeof o.customer_id === 'string'
          ? o.customer_id
          : '';
    if (!cid) {
      throw new Error('users/validate sin customerId en respuesta');
    }
    this.customerId = cid;
    shippingLogger.info('MiCorreo customerId cacheado', {
      customerIdSuffix: redactCustomerId(cid),
    });
    return cid;
  }

  async getValidToken(): Promise<string> {
    const now = Date.now();
    if (this.token != null && now < this.tokenValidUntilMs) {
      return this.token;
    }
    const { username, password } = this.getCredentials();
    const url = `${this.baseUrl}${CORREO_PATHS.token}`;
    const started = Date.now();
    shippingLogger.info('MiCorreo request start', {
      method: 'POST',
      path: CORREO_PATHS.token,
    });
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(username, password),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: this.timeoutSignal(),
    });
    const text = await res.text();
    const latencyMs = Date.now() - started;
    shippingLogger.info('MiCorreo request end', {
      method: 'POST',
      path: CORREO_PATHS.token,
      status: res.status,
      latencyMs,
    });
    let data: unknown = {};
    try {
      data = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`token ${res.status}: ${text.slice(0, 500)}`);
    }
    const o = data as Record<string, unknown>;
    const tok =
      typeof o.token === 'string'
        ? o.token
        : typeof o.access_token === 'string'
          ? o.access_token
          : '';
    if (!tok) {
      throw new Error('token sin campo token en respuesta');
    }
    this.token = tok;
    let expiresMs: number;
    if (typeof o.expires === 'string' && o.expires.trim()) {
      expiresMs = parseExpiresMs(o.expires);
    } else if (typeof o.expires_in === 'number' && Number.isFinite(o.expires_in)) {
      expiresMs = now + o.expires_in * 1000;
    } else if (typeof o.expires_in === 'string') {
      const sec = Number.parseFloat(o.expires_in);
      expiresMs = Number.isFinite(sec) ? now + sec * 1000 : now + 3600_000;
    } else {
      expiresMs = now + 3600_000;
    }
    this.tokenValidUntilMs = expiresMs - 60_000;
    return tok;
  }

  async validateCredentials(): Promise<void> {
    await this.getValidToken();
    await this.getCustomerId();
  }

  /** Fuerza renovación del JWT (p. ej. tras 401 en un request autenticado). */
  invalidateToken(): void {
    this.token = null;
    this.tokenValidUntilMs = 0;
    this.customerId = null;
    this.customerIdInFlight = null;
  }

  invalidateSession(): void {
    this.invalidateToken();
    this.customerId = null;
    this.customerIdInFlight = null;
  }
}
