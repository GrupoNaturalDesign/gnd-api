import prisma from '../../../lib/prisma';
import type { ShippingProvider } from '../shipping.provider';
import type {
  AgencyFilters,
  CreateShippingOrderInput,
  ShippingAgency,
  ShippingLabel,
  ShippingLabelContext,
  ShippingOrderResult,
  ShippingProviderName,
  ShippingTrackingResult,
} from '../shipping.types';
import {
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from '../shipping.errors';
import {
  getAndreaniBaseUrl,
  getAndreaniPaths,
  loadAndreaniCredentials,
  mapEmpresaEnvioToAndreaniEnv,
} from './andreani.config';
import { AndreaniAuthService } from './andreani.auth.service';
import { AndreaniHttp } from './andreani.http';
import { AndreaniCotizacionService } from './andreani.cotizacion.service';
import { AndreaniPreEnvioService } from './andreani.preenvio.service';
import { AndreaniEnvioService } from './andreani.envio.service';
import {
  extractNumeroEnvioYAgrupador,
  mapPedidoToAndreaniOrdenEnvio,
} from './andreani.mapper';
import type { AndreaniCotizacionInput, AndreaniCotizacionResultado } from './andreani.types';
import type { FetchFn } from '../../../types/fetch.types';

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

export class AndreaniProvider implements ShippingProvider {
  readonly providerName: ShippingProviderName = 'andreani';

  private readonly auth: AndreaniAuthService;
  private readonly http: AndreaniHttp;
  private readonly cotizacion: AndreaniCotizacionService;
  private readonly preenvio: AndreaniPreEnvioService;
  private readonly envio: AndreaniEnvioService;

  constructor(
    andreaniEnvFromDb: string,
    private readonly fetchImpl: FetchFn = globalThis.fetch.bind(globalThis) as FetchFn
  ) {
    const env = mapEmpresaEnvioToAndreaniEnv(andreaniEnvFromDb);
    const baseUrl = getAndreaniBaseUrl(env);
    const paths = getAndreaniPaths();
    const creds = loadAndreaniCredentials(env);
    this.auth = new AndreaniAuthService(baseUrl, paths.login, creds, this.fetchImpl);
    this.http = new AndreaniHttp(baseUrl, this.auth, this.fetchImpl);
    this.cotizacion = new AndreaniCotizacionService(
      this.http,
      paths,
      andreaniEnvFromDb
    );
    this.preenvio = new AndreaniPreEnvioService(this.http, paths);
    this.envio = new AndreaniEnvioService(this.http, paths);
  }

  /** Cotización (checkout). */
  async cotizarEnvio(input: AndreaniCotizacionInput): Promise<AndreaniCotizacionResultado> {
    return this.cotizacion.cotizar(input);
  }

  async validateCredentials(): Promise<void> {
    await this.auth.login();
  }

  async createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: input.pedidoId, empresaId: input.empresaId },
    });
    if (!pedido) {
      throw new ShippingValidationError('Pedido no encontrado');
    }

    const body = mapPedidoToAndreaniOrdenEnvio(input, pedido);
    const resp = await this.preenvio.crearOrden(body, input.pedidoId);
    const { numeroEnvio, agrupador } = extractNumeroEnvioYAgrupador(resp);

    return {
      trackingNumber: numeroEnvio,
      provider: 'andreani',
      andreaniAgrupadorBultos: agrupador,
    };
  }

  async cancelOrder(_trackingNumber: string): Promise<void> {
    void _trackingNumber;
    throw new ShippingMethodNotSupportedError(
      'Andreani: cancelación de envío no implementada'
    );
  }

  async getLabel(
    trackingNumber: string,
    context?: ShippingLabelContext
  ): Promise<ShippingLabel> {
    if (context?.pedidoId == null || context.empresaId == null) {
      throw new ShippingValidationError(
        'Etiqueta Andreani: se requiere context.pedidoId y context.empresaId'
      );
    }
    const pedido = await prisma.pedido.findFirst({
      where: { id: context.pedidoId, empresaId: context.empresaId },
    });
    if (!pedido?.andreaniAgrupadorBultos) {
      throw new ShippingValidationError(
        'Etiqueta Andreani: el pedido no tiene andreaniAgrupadorBultos (crear orden de envío primero)'
      );
    }
    const { buffer, contentType } = await this.envio.descargarEtiquetaPorAgrupador(
      pedido.andreaniAgrupadorBultos,
      1
    );
    const ext = contentType.includes('png') ? 'png' : 'pdf';
    return {
      trackingNumber,
      fileBase64: bufferToBase64(buffer),
      fileName: `andreani-${trackingNumber}.${ext}`,
    };
  }

  async getTracking(trackingNumbers: string[]): Promise<ShippingTrackingResult[]> {
    const out: ShippingTrackingResult[] = [];
    for (const tn of trackingNumbers) {
      const raw = await this.envio.consultarTrazas(tn);
      out.push(mapTrazasToShippingResult(tn, raw));
    }
    return out;
  }

  async getAgencies(filters: AgencyFilters): Promise<ShippingAgency[]> {
    const path = process.env.ANDREANI_PATH_AGENCIAS?.trim();
    if (!path) {
      return [];
    }
    const q: Record<string, string> = {};
    if (filters.stateId) q.provincia = filters.stateId;
    const p = path.startsWith('/') ? path : `/${path}`;
    const { data } = await this.http.requestJson('GET', p, { query: q });
    return mapAgenciasResponse(data);
  }
}

function mapTrazasToShippingResult(
  trackingNumber: string,
  raw: unknown
): ShippingTrackingResult {
  const events: ShippingTrackingResult['events'] = [];
  if (raw && typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    const arr = o.eventos ?? o.events;
    if (Array.isArray(arr)) {
      for (const ev of arr) {
        if (!ev || typeof ev !== 'object') continue;
        const e = ev as Record<string, unknown>;
        events.push({
          statusId: String(e.EstadoId ?? e.estadoId ?? ''),
          status: String(e.Estado ?? e.estado ?? ''),
          date: String(e.Fecha ?? e.fecha ?? ''),
          facility: String(e.Sucursal ?? e.sucursal ?? ''),
        });
      }
    }
  }
  return { trackingNumber, provider: 'andreani', events };
}

function unwrapAgenciasArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const nested = o.sucursales ?? o.data ?? o.results ?? o.items;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function mapAgenciasResponse(data: unknown): ShippingAgency[] {
  const dataArr = unwrapAgenciasArray(data);
  return dataArr
    .map((row): ShippingAgency | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const id =
        r.id ??
        r.codigo ??
        r.nomenclatura ??
        r.IdSucursal ??
        r.idSucursal;
      if (id == null) return null;
      return {
        agencyId: String(id),
        name: String(
          r.descripcion ?? r.Descripcion ?? r.nombre ?? r.name ?? id
        ),
        address: String(
          r.direccion ?? r.Direccion ?? r.calle ?? r.domicilio ?? ''
        ),
        city: String(r.localidad ?? r.Localidad ?? r.ciudad ?? ''),
        state: String(r.provincia ?? r.Provincia ?? r.region ?? ''),
        zipCode: String(r.codigoPostal ?? r.CodigoPostal ?? r.cp ?? ''),
        schedule: String(r.horario ?? r.horarios ?? ''),
        phone: r.telefono != null ? String(r.telefono) : undefined,
        email: r.email != null ? String(r.email) : undefined,
        latitude: r.latitud != null ? String(r.latitud) : undefined,
        longitude: r.longitud != null ? String(r.longitud) : undefined,
        pickupAvailability: true,
        packageReception: true,
      };
    })
    .filter((x): x is ShippingAgency => x != null);
}
