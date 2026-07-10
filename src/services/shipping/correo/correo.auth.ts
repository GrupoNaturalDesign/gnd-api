import { shippingLogger } from '../../../lib/shipping-logger';
import type { FetchFn } from '../../../types/fetch.types';
import {
  CORREO_PATHS,
  getCorreoBaseUrlForEnv,
  getCorreoTimeoutMs,
  loadCorreoCredentials,
  type CorreoEnv,
} from './correo.config';
import { fetchMicorreoIntegratorToken } from './correo-integrator-token';

function redactCustomerId(id: string): string {
  if (id.length <= 4) return '****';
  return `…${id.slice(-4)}`;
}

export interface CorreoAccountCredentials {
  email: string;
  password: string;
  customerId?: string | null;
}

export interface CorreoAuthOptions {
  env: CorreoEnv;
  fetchImpl: FetchFn;
  account: CorreoAccountCredentials;
  onCustomerIdResolved?: (customerId: string) => void | Promise<void>;
}

/**
 * Token JWT vía POST /token (integrador env) y customerId vía POST /users/validate (cuenta empresa).
 */
export class CorreoAuth {
  private token: string | null = null;
  private tokenValidUntilMs = 0;
  private customerId: string | null;
  private customerIdInFlight: Promise<string> | null = null;

  constructor(private readonly options: CorreoAuthOptions) {
    this.customerId = options.account.customerId?.trim() || null;
  }

  private get env(): CorreoEnv {
    return this.options.env;
  }

  private get fetchImpl(): FetchFn {
    return this.options.fetchImpl;
  }

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

  setCustomerId(customerId: string | null): void {
    this.customerId = customerId?.trim() || null;
  }

  async getCustomerId(): Promise<string> {
    if (this.customerId != null) return this.customerId;
    if (!this.customerIdInFlight) {
      this.customerIdInFlight = this.fetchCustomerIdFromApi().finally(() => {
        this.customerIdInFlight = null;
      });
    }
    return this.customerIdInFlight;
  }

  private async fetchCustomerIdFromApi(): Promise<string> {
    const tok = await this.getValidToken();
    const { email, password } = this.options.account;
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
          ? ' Revisá la cuenta MiCorreo en Admin → Configuración → Envíos.'
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
    await this.options.onCustomerIdResolved?.(cid);
    return cid;
  }

  async getValidToken(): Promise<string> {
    const now = Date.now();
    if (this.token != null && now < this.tokenValidUntilMs) {
      return this.token;
    }
    const { token, validUntilMs } = await fetchMicorreoIntegratorToken(
      this.env,
      this.fetchImpl
    );
    this.token = token;
    this.tokenValidUntilMs = validUntilMs;
    return token;
  }

  async validateCredentials(): Promise<void> {
    await this.getValidToken();
    await this.getCustomerId();
  }

  invalidateToken(): void {
    this.token = null;
    this.tokenValidUntilMs = 0;
    this.customerIdInFlight = null;
  }

  invalidateSession(): void {
    this.invalidateToken();
    this.customerId = null;
  }

  invalidateCustomerId(): void {
    this.customerId = null;
    this.customerIdInFlight = null;
  }
}

/** Constructor legacy para tests y health checks sin BD. */
export function createCorreoAuthFromEnv(
  env: CorreoEnv,
  fetchImpl: FetchFn,
  account: CorreoAccountCredentials
): CorreoAuth {
  return new CorreoAuth({ env, fetchImpl, account });
}
