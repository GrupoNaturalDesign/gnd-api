import { shippingLogger } from '../../../lib/shipping-logger';
import type { FetchFn } from '../../../types/fetch.types';
import { ShippingConfigError } from '../shipping.errors';
import {
  CORREO_PATHS,
  getCorreoBaseUrlForEnv,
  getCorreoTimeoutMs,
  loadCorreoCredentials,
  type CorreoEnv,
} from './correo.config';

export const MICORREO_INTEGRATOR_UNAUTHORIZED = 'MICORREO_INTEGRATOR_UNAUTHORIZED';

export interface MicorreoIntegratorTokenResult {
  token: string;
  /** Timestamp ms (UTC) hasta cuándo cachear el JWT (con margen de 60s). */
  validUntilMs: number;
}

function basicAuthHeader(username: string, password: string): string {
  const raw = `${username}:${password}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

function mapTokenHttpError(status: number, bodyText: string, env: CorreoEnv): never {
  const envLabel = env === 'prod' ? 'producción' : 'test/sandbox';
  if (status === 401) {
    throw new ShippingConfigError(
      `MiCorreo ${envLabel} rechazó las credenciales API del servidor (POST /token 401). Revisá CORREO_USERNAME_${env === 'prod' ? 'PROD' : 'QA'} y CORREO_PASSWORD_${env === 'prod' ? 'PROD' : 'QA'} en el entorno. La cuenta portal puede seguir vinculada en Admin → Envíos.`,
      { code: MICORREO_INTEGRATOR_UNAUTHORIZED, httpStatus: 503 }
    );
  }
  throw new ShippingConfigError(
    `MiCorreo ${envLabel}: error al obtener token integrador (${status}): ${bodyText.slice(0, 300)}`,
    { code: 'MICORREO_INTEGRATOR_TOKEN_ERROR', httpStatus: 502 }
  );
}

function parseExpiresMs(data: Record<string, unknown>, now: number): number {
  if (typeof data.expires === 'string' && data.expires.trim()) {
    const t = Date.parse(data.expires);
    if (Number.isFinite(t)) return t - 60_000;
  }
  if (typeof data.expires_in === 'number' && Number.isFinite(data.expires_in)) {
    return now + data.expires_in * 1000 - 60_000;
  }
  if (typeof data.expires_in === 'string') {
    const sec = Number.parseFloat(data.expires_in);
    if (Number.isFinite(sec)) return now + sec * 1000 - 60_000;
  }
  return now + 3600_000 - 60_000;
}

/** POST /token — credenciales integrador (CORREO_USERNAME_* / CORREO_PASSWORD_*). */
export async function fetchMicorreoIntegratorToken(
  env: CorreoEnv,
  fetchImpl: FetchFn = globalThis.fetch.bind(globalThis)
): Promise<MicorreoIntegratorTokenResult> {
  let username: string;
  let password: string;
  try {
    ({ username, password } = loadCorreoCredentials(env));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ShippingConfigError(
      `Credenciales integrador MiCorreo no configuradas: ${msg}`,
      { code: 'MICORREO_INTEGRATOR_MISCONFIGURED', httpStatus: 400 }
    );
  }

  const url = `${getCorreoBaseUrlForEnv(env)}${CORREO_PATHS.token}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), getCorreoTimeoutMs());
  t.unref?.();

  const started = Date.now();
  shippingLogger.info('MiCorreo request start', { method: 'POST', path: CORREO_PATHS.token });

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(username, password),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: c.signal,
    });
  } catch (e: unknown) {
    const latencyMs = Date.now() - started;
    shippingLogger.error('MiCorreo request end', {
      method: 'POST',
      path: CORREO_PATHS.token,
      status: 0,
      latencyMs,
      error: e instanceof Error ? e.message : String(e),
    });
    throw new ShippingConfigError(
      `No se pudo conectar con MiCorreo para obtener token integrador: ${e instanceof Error ? e.message : String(e)}`,
      { code: 'MICORREO_INTEGRATOR_NETWORK', httpStatus: 502 }
    );
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  const latencyMs = Date.now() - started;
  shippingLogger.info('MiCorreo request end', {
    method: 'POST',
    path: CORREO_PATHS.token,
    status: res.status,
    latencyMs,
  });

  if (!res.ok) {
    mapTokenHttpError(res.status, text, env);
  }

  let data: unknown = {};
  try {
    data = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    data = {};
  }
  const o = data as Record<string, unknown>;
  const tok =
    typeof o.token === 'string'
      ? o.token
      : typeof o.access_token === 'string'
        ? o.access_token
        : '';
  if (!tok) {
    throw new ShippingConfigError('MiCorreo no devolvió token en la respuesta de /token', {
      code: 'MICORREO_INTEGRATOR_TOKEN_ERROR',
      httpStatus: 502,
    });
  }
  const now = Date.now();
  return { token: tok, validUntilMs: parseExpiresMs(o, now) };
}

/** Convierte errores legacy `token 401: ...` a ShippingConfigError tipado. */
export function toMicorreoIntegratorConfigError(e: unknown, env: CorreoEnv): ShippingConfigError {
  if (e instanceof ShippingConfigError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (/token\s+401/i.test(msg)) {
    const envLabel = env === 'prod' ? 'producción' : 'test/sandbox';
    return new ShippingConfigError(
      `MiCorreo ${envLabel} rechazó las credenciales API del servidor (POST /token 401). Revisá las variables CORREO_* del integrador en el entorno.`,
      { code: MICORREO_INTEGRATOR_UNAUTHORIZED, httpStatus: 503 }
    );
  }
  return new ShippingConfigError(`Credenciales MiCorreo inválidas: ${msg}`, {
    code: 'MICORREO_CONFIG_ERROR',
    httpStatus: 400,
  });
}
