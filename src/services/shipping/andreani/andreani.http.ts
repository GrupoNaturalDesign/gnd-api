import { ShippingHttpError } from '../shipping.errors';
import { AndreaniAuthService } from './andreani.auth.service';
import { getAndreaniRequestTimeoutMs } from './andreani.config';

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function messageFromBody(body: unknown): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const m = o.message ?? o.error ?? o.descripcion ?? o.title;
    if (typeof m === 'string' && m.trim()) return m;
    const detail = o.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const errors = o.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors
        .map((e) => {
          if (e && typeof e === 'object' && !Array.isArray(e)) {
            const er = e as Record<string, unknown>;
            const msg = er.message ?? er.descripcion ?? er.detail;
            if (typeof msg === 'string') return msg;
          }
          return typeof e === 'string' ? e : null;
        })
        .filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (parts.length) return parts.join('; ');
    }
  }
  return 'Error en API Andreani';
}

export class AndreaniHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: AndreaniAuthService,
    private readonly fetchImpl: typeof fetch
  ) {}

  async requestJson(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: {
      body?: unknown;
      contentType?: 'json' | 'form';
      query?: Record<string, string>;
    }
  ): Promise<{ status: number; data: unknown }> {
    const doRequest = async (): Promise<{ status: number; data: unknown }> => {
      const token = await this.auth.getToken();
      const headers: Record<string, string> = {
        ...this.auth.authHeaderForRequest(token),
        Accept: 'application/json',
      };

      let bodyStr: string | undefined;
      if (options?.body !== undefined) {
        if (options.contentType === 'form') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
          bodyStr =
            typeof options.body === 'string'
              ? options.body
              : new URLSearchParams(options.body as Record<string, string>).toString();
        } else {
          headers['Content-Type'] = 'application/json;charset=UTF-8';
          bodyStr = JSON.stringify(options.body);
        }
      }

      const q = options?.query;
      const qs = q
        ? `?${new URLSearchParams(q).toString()}`
        : '';
      const p = path.startsWith('/') ? path : `/${path}`;
      const url = `${this.baseUrl}${p}${qs}`;

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), getAndreaniRequestTimeoutMs());

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });
        const text = await res.text();
        const data = text ? parseJsonSafe(text) : null;
        if (!res.ok) {
          throw new ShippingHttpError(messageFromBody(data), res.status, data);
        }
        return { status: res.status, data };
      } finally {
        clearTimeout(t);
      }
    };

    try {
      return await doRequest();
    } catch (e: unknown) {
      if (e instanceof ShippingHttpError && (e.status === 401 || e.status === 403)) {
        this.auth.invalidate();
        return doRequest();
      }
      if (e instanceof Error && e.name === 'AbortError') {
        throw new ShippingHttpError('Andreani: timeout de solicitud', 504, null);
      }
      throw e;
    }
  }

  async getBinary(pathWithQuery: string): Promise<{ status: number; buffer: ArrayBuffer; contentType: string }> {
    const doRequest = async (): Promise<{
      status: number;
      buffer: ArrayBuffer;
      contentType: string;
    }> => {
      const token = await this.auth.getToken();
      const headers: Record<string, string> = {
        ...this.auth.authHeaderForRequest(token),
        Accept: 'application/pdf,application/octet-stream,*/*',
      };
      const p = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
      const url =
        pathWithQuery.startsWith('http://') || pathWithQuery.startsWith('https://')
          ? pathWithQuery
          : `${this.baseUrl}${p}`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), getAndreaniRequestTimeoutMs());
      try {
        const res = await this.fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
        const buffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const txt = new TextDecoder().decode(buffer.slice(0, 2000));
            const j = JSON.parse(txt) as Record<string, unknown>;
            if (typeof j.message === 'string') msg = j.message;
          } catch {
            /* ignore */
          }
          throw new ShippingHttpError(msg, res.status, null);
        }
        return { status: res.status, buffer, contentType };
      } finally {
        clearTimeout(t);
      }
    };

    try {
      return await doRequest();
    } catch (e: unknown) {
      if (e instanceof ShippingHttpError && (e.status === 401 || e.status === 403)) {
        this.auth.invalidate();
        return doRequest();
      }
      if (e instanceof Error && e.name === 'AbortError') {
        throw new ShippingHttpError('Andreani: timeout descargando binario', 504, null);
      }
      throw e;
    }
  }
}
