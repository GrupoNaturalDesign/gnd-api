import { ShippingHttpError, ShippingValidationError } from '../shipping.errors';
import type { AndreaniCredentials } from './andreani.config';
import { getAndreaniRequestTimeoutMs, getAndreaniTokenHeaderName, isAndreaniMock } from './andreani.config';
import type { AndreaniLoginResponse } from './andreani.types';
import type { FetchFn } from '../../../types/fetch.types';

/**
 * Token en memoria por instancia (proceso). Para multi-empresa con credenciales distintas, usar una instancia por empresa.
 */
export class AndreaniAuthService {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly loginPath: string,
    private readonly credentials: AndreaniCredentials,
    private readonly fetchImpl: FetchFn
  ) {}

  invalidate(): void {
    this.token = null;
  }

  getTokenCached(): string | null {
    return this.token;
  }

  async getToken(): Promise<string> {
    if (this.token) return this.token;
    return this.login();
  }

  private basicHeader(): string {
    const { username, password } = this.credentials;
    const raw = `${username}:${password}`;
    return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
  }

  async login(): Promise<string> {
    if (isAndreaniMock()) return 'MOCK_TOKEN';
    const { username, password } = this.credentials;
    if (!username || !password) {
      throw new ShippingValidationError(
        'Credenciales Andreani: configure ANDREANI_USERNAME y ANDREANI_PASSWORD (o USER_ANDREANI / PASS_ANDREANI)'
      );
    }

    const url = `${this.baseUrl}${this.loginPath.startsWith('/') ? '' : '/'}${this.loginPath}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), getAndreaniRequestTimeoutMs());

    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: this.basicHeader(),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        throw new ShippingHttpError(
          messageFromLoginFailure(res.status, data),
          res.status,
          data
        );
      }

      const parsed = data as AndreaniLoginResponse;
      const tok = parsed.token ?? parsed.access_token;
      if (typeof tok !== 'string' || !tok.trim()) {
        throw new ShippingHttpError(
          'Login Andreani: respuesta sin token (revisar formato API)',
          res.status,
          data
        );
      }
      this.token = tok.trim();
      return this.token;
    } catch (e: unknown) {
      if (e instanceof ShippingHttpError) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new ShippingHttpError('Login Andreani: timeout', 504, null);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  authHeaderForRequest(token: string): Record<string, string> {
    const name = getAndreaniTokenHeaderName();
    return { [name]: token };
  }
}

function messageFromLoginFailure(status: number, body: unknown): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const m = o.message ?? o.error ?? o.descripcion;
    if (typeof m === 'string') return `Login Andreani: ${m}`;
  }
  return `Login Andreani falló (HTTP ${status})`;
}
