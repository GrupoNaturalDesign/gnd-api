import type { AndreaniHttp } from './andreani.http';
import type { AndreaniPaths } from './andreani.config';
import { isAndreaniMock } from './andreani.config';
import { mockLabelBase64 } from './andreani.mock';

export class AndreaniEnvioService {
  constructor(
    private readonly http: AndreaniHttp,
    private readonly paths: AndreaniPaths
  ) {}

  private enviosBase(): string {
    const p = this.paths.envios.startsWith('/') ? this.paths.envios : `/${this.paths.envios}`;
    return p;
  }

  async consultarEstado(numeroAndreani: string): Promise<unknown> {
    if (isAndreaniMock()) {
      return {
        numeroDeTracking: numeroAndreani,
        estado: 'Mock',
        ciclo: 'Distribution',
      };
    }
    const path = `${this.enviosBase()}/${encodeURIComponent(numeroAndreani)}/estado`;
    const { data } = await this.http.requestJson('GET', path);
    return data;
  }

  async consultarTrazas(numeroAndreani: string): Promise<unknown> {
    if (isAndreaniMock()) {
      return {
        eventos: [
          {
            Fecha: new Date().toISOString(),
            Estado: 'Mock',
            Traduccion: 'ANDREANI_MOCK',
          },
        ],
      };
    }
    const path = `${this.enviosBase()}/${encodeURIComponent(numeroAndreani)}/trazas`;
    const { data } = await this.http.requestJson('GET', path);
    return data;
  }

  async descargarEtiquetaPorAgrupador(
    agrupadorDeBultos: string,
    bulto: number = 1
  ): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    if (isAndreaniMock()) {
      const buf = Buffer.from(mockLabelBase64(), 'base64');
      const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return { buffer: copy, contentType: 'application/pdf' };
    }
    const ordBase = this.paths.ordenesEnvio.startsWith('/')
      ? this.paths.ordenesEnvio
      : `/${this.paths.ordenesEnvio}`;
    const path = `${ordBase}/${encodeURIComponent(agrupadorDeBultos)}/etiquetas?bulto=${encodeURIComponent(String(bulto))}`;
    const { buffer, contentType } = await this.http.getBinary(path);
    return { buffer, contentType };
  }
}
