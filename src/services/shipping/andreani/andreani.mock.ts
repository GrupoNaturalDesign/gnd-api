import type { AndreaniCotizacionResultado, AndreaniCotizacionInput } from './andreani.types';
import type { AndreaniOrdenEnvioResponse } from './andreani.types';

const MOCK_TRACKING = '360000102000579';
const MOCK_AGRUPADOR = 'API0000000479719';

/** PDF mínimo válido (1 página vacía), en base64 — solo para ANDREANI_MOCK. */
const MOCK_LABEL_BASE64 =
  'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHMgWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCAzIDNdPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwNTc0IDAwMDAwIG4gCjAwMDAwMDYzMDggMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo2OTIKJSVFT0YK';

export function mockCotizar(_input: AndreaniCotizacionInput, entorno: string): AndreaniCotizacionResultado {
  return {
    proveedor: 'ANDREANI',
    precio: 1000,
    moneda: 'ARS',
    plazoEntrega: 'Mock',
    servicio: 'Mock',
    entorno,
    raw: { mock: true },
  };
}

export function mockCrearOrdenEnvio(_pedidoId: number): AndreaniOrdenEnvioResponse {
  return {
    estado: 'Solicitada',
    tipo: 'B2C',
    fechaCreacion: new Date().toISOString(),
    agrupadorDeBultos: MOCK_AGRUPADOR,
    bultos: [
      {
        numeroDeBulto: '1',
        numeroDeEnvio: MOCK_TRACKING,
        totalizador: '1/1',
        linking: [
          {
            meta: 'Etiqueta',
            contenido: `https://example.invalid/etiquetas?bulto=1`,
          },
        ],
      },
    ],
    etiquetasPorAgrupador: `https://example.invalid/${MOCK_AGRUPADOR}/etiquetas`,
  };
}

export function mockLabelBase64(): string {
  return MOCK_LABEL_BASE64;
}

export { MOCK_TRACKING, MOCK_AGRUPADOR };
