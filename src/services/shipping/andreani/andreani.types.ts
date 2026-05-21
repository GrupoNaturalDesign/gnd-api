/** Respuesta típica de login Andreani */
export interface AndreaniLoginResponse {
  token?: string;
  access_token?: string;
  refreshToken?: string;
}

/** Resultado normalizado de cotización para el checkout */
export interface AndreaniCotizacionResultado {
  proveedor: 'ANDREANI';
  precio: number;
  moneda: string;
  plazoEntrega?: string;
  servicio?: string;
  entorno: string;
  raw?: unknown;
}

export interface AndreaniCotizacionInput {
  cpDestino: string;
  contrato: string;
  cliente: string;
  sucursalOrigen?: string;
  bultos: Array<{
    volumenCm3: number;
    kilos?: number;
    valorDeclarado?: number;
    altoCm?: number;
    largoCm?: number;
    anchoCm?: number;
  }>;
}

/** Elemento linking en respuesta de bultos */
export interface AndreaniLinkingItem {
  meta?: string;
  contenido?: string;
}

export interface AndreaniBultoRespuesta {
  numeroDeBulto?: string;
  numeroDeEnvio?: string;
  totalizador?: string;
  linking?: AndreaniLinkingItem[];
}

/** Respuesta creación orden de envío (pre-envío) — campos usados por el provider */
export interface AndreaniOrdenEnvioResponse {
  estado?: string;
  tipo?: string;
  agrupadorDeBultos?: string;
  bultos?: AndreaniBultoRespuesta[];
  etiquetasPorAgrupador?: string;
  fechaCreacion?: string;
  [key: string]: unknown;
}
