import type { AndreaniHttp } from './andreani.http';
import type { AndreaniPaths } from './andreani.config';
import { isAndreaniMock } from './andreani.config';
import { mockCrearOrdenEnvio } from './andreani.mock';
import type { AndreaniOrdenEnvioResponse } from './andreani.types';

export class AndreaniPreEnvioService {
  constructor(
    private readonly http: AndreaniHttp,
    private readonly paths: AndreaniPaths
  ) {}

  async crearOrden(
    body: Record<string, unknown>,
    pedidoId: number
  ): Promise<AndreaniOrdenEnvioResponse> {
    if (isAndreaniMock()) {
      return mockCrearOrdenEnvio(pedidoId);
    }
    const path = this.paths.ordenesEnvio.startsWith('/')
      ? this.paths.ordenesEnvio
      : `/${this.paths.ordenesEnvio}`;
    const { data } = await this.http.requestJson('POST', path, {
      body,
      contentType: 'json',
    });
    return data as AndreaniOrdenEnvioResponse;
  }

  async consultarPorNumeroEnvio(numeroDeEnvio: string): Promise<unknown> {
    if (isAndreaniMock()) {
      return { estado: 'Creada', bultos: [], agrupadorDeBultos: 'MOCK' };
    }
    const base = this.paths.ordenesEnvio.startsWith('/')
      ? this.paths.ordenesEnvio
      : `/${this.paths.ordenesEnvio}`;
    const path = `${base}/${encodeURIComponent(numeroDeEnvio)}`;
    const { data } = await this.http.requestJson('GET', path);
    return data;
  }
}
