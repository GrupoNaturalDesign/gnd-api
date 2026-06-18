import { ShippingValidationError } from '../shipping.errors';
import type { AndreaniHttp } from './andreani.http';
import type { AndreaniPaths } from './andreani.config';
import { mapEmpresaEnvioToAndreaniEnv } from './andreani.config';
import { isAndreaniMock } from './andreani.config';
import { mockCotizar } from './andreani.mock';
import type { AndreaniCotizacionInput, AndreaniCotizacionResultado } from './andreani.types';
import { extractPrecioCotizacion } from './andreani.mapper';

function formatPositiveDecimal(value: number, decimals: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(decimals).replace(/\.?0+$/, '');
}

function formatPositiveInteger(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.max(0, Math.round(n)));
}

export class AndreaniCotizacionService {
  constructor(
    private readonly http: AndreaniHttp,
    private readonly paths: AndreaniPaths,
    private readonly andreaniEnv: string
  ) {}

  async cotizar(input: AndreaniCotizacionInput): Promise<AndreaniCotizacionResultado> {
    const env = mapEmpresaEnvioToAndreaniEnv(this.andreaniEnv);
    const entornoLabel = env === 'prod' ? 'PROD' : 'QA';
    const isNonProd = process.env.NODE_ENV !== 'production';

    if (isAndreaniMock()) {
      return mockCotizar(input, entornoLabel);
    }

    const fields: Record<string, string> = {
      cpDestino: input.cpDestino,
      contrato: input.contrato,
      cliente: input.cliente,
    };
    if (input.sucursalOrigen) {
      fields.sucursalOrigen = input.sucursalOrigen;
    }
    input.bultos.forEach((b, i) => {
      fields[`bultos[${i}][volumen]`] = formatPositiveInteger(b.volumenCm3);
      if (b.kilos != null) fields[`bultos[${i}][kilos]`] = formatPositiveDecimal(b.kilos, 3);
      if (b.valorDeclarado != null) {
        fields[`bultos[${i}][valorDeclarado]`] = formatPositiveDecimal(b.valorDeclarado, 2);
      }
      if (b.altoCm != null) fields[`bultos[${i}][altoCm]`] = formatPositiveInteger(b.altoCm);
      if (b.largoCm != null) fields[`bultos[${i}][largoCm]`] = formatPositiveInteger(b.largoCm);
      if (b.anchoCm != null) fields[`bultos[${i}][anchoCm]`] = formatPositiveInteger(b.anchoCm);
    });

    if (isNonProd) {
      console.log('[Andreani quote query]', fields);
    }

    const { data } = await this.http.requestJson('GET', this.paths.cotizar, {
      query: fields,
    });

    if (isNonProd) {
      console.log('[Andreani quote raw]', JSON.stringify(data, null, 2));
    }

    const precio = extractPrecioCotizacion(data);
    if (!Number.isFinite(precio)) {
      throw new ShippingValidationError(
        'Cotización Andreani: no se pudo leer el precio de la respuesta (ajustar extractPrecioCotizacion o paths)'
      );
    }

    return {
      proveedor: 'ANDREANI',
      precio,
      moneda: 'ARS',
      plazoEntrega:
        data && typeof data === 'object' && typeof (data as { plazoEntrega?: string }).plazoEntrega === 'string'
          ? (data as { plazoEntrega: string }).plazoEntrega
          : undefined,
      servicio:
        data && typeof data === 'object' && typeof (data as { servicio?: string }).servicio === 'string'
          ? (data as { servicio: string }).servicio
          : undefined,
      entorno: entornoLabel,
      raw: data,
    };
  }
}
