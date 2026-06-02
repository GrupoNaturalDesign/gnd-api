import { EstadoPedido } from '@prisma/client';
import { sfactoryService } from './sfactory.service';
import { parseSfactoryEstado } from '../../utils/sfactory-pedido-response.util';
import { SFACTORY_PE_ESTADO } from './sfactory-orden-pedido.config';
import type { SFactoryEditarOrdenPedidoParams } from '../../types/sfactory.types';

/** Extrae el bloque `data` de ventas_leer_orden_pedido / ventas_editar_orden_pedido. */
export function extractPedidoData(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') return null;
  const o = response as Record<string, unknown>;
  if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
    return { ...(o.data as Record<string, unknown>) };
  }
  if (o.pedido && typeof o.pedido === 'object' && !Array.isArray(o.pedido)) {
    return { ...(o.pedido as Record<string, unknown>) };
  }
  return { ...o };
}

/** Extrae líneas de ítems de la respuesta de lectura/edición de orden. */
export function extractPedidoItems(response: unknown): Record<string, unknown>[] {
  if (!response || typeof response !== 'object') return [];
  const o = response as Record<string, unknown>;
  const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null;
  const candidates = [o.items, o.detalle, o.detalles, data?.items, data?.detalle, data?.detalles];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
    }
  }
  return [];
}

function normalizeEstadoCodigo(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/** Estado PE desde respuesta de ventas_leer_orden_pedido. */
export function parseEstadoFromOrdenResponse(response: unknown): string | null {
  const data = extractPedidoData(response);
  if (!data) return parseSfactoryEstado(response);
  return (
    normalizeEstadoCodigo(data.estado) ??
    normalizeEstadoCodigo(data.estado_id) ??
    normalizeEstadoCodigo(data.estadoId) ??
    normalizeEstadoCodigo(data.codigo_estado) ??
    parseSfactoryEstado(response)
  );
}

export interface BuildEditarOrdenPedidoOptions {
  orderId: number;
  nuevoEstado: string;
  observacionesAppend?: string;
}

/** Arma parameters para ventas_editar_orden_pedido (data + items completos). */
export function buildEditarOrdenPedidoPayload(
  remote: unknown,
  options: BuildEditarOrdenPedidoOptions
): SFactoryEditarOrdenPedidoParams {
  const data = extractPedidoData(remote);
  if (!data) {
    throw new Error('No se pudo obtener data de la orden SFactory para editar estado.');
  }

  const observacionesBase = String(data.observaciones ?? '');
  const observaciones =
    options.observacionesAppend != null && options.observacionesAppend !== ''
      ? `${observacionesBase}\n${options.observacionesAppend}`.trim()
      : observacionesBase || undefined;

  const items = extractPedidoItems(remote);
  const root = remote && typeof remote === 'object' ? (remote as Record<string, unknown>) : null;
  const itemsDeletedRaw = root?.items_deleted;
  const items_deleted = Array.isArray(itemsDeletedRaw)
    ? itemsDeletedRaw.map(String)
    : undefined;

  return {
    data: {
      ...data,
      id: (data.id as number | undefined) ?? options.orderId,
      estado: options.nuevoEstado,
      ...(observaciones !== undefined ? { observaciones } : {}),
    } as SFactoryEditarOrdenPedidoParams['data'],
    items: items as SFactoryEditarOrdenPedidoParams['items'],
    ...(items_deleted?.length ? { items_deleted } : {}),
  };
}

export interface CambiarEstadoOrdenPedidoResult {
  remote: unknown;
  editPayload?: SFactoryEditarOrdenPedidoParams;
  response: unknown;
  skippedEdit: boolean;
  estadoAnterior: string | null;
  estadoNuevo: string;
}

/**
 * Lee la orden PE y cambia su estado vía ventas_editar_orden_pedido.
 * Idempotente si el estado remoto ya coincide con nuevoEstado.
 */
export async function cambiarEstadoOrdenPedido(
  orderId: number,
  companyKey: string | undefined,
  nuevoEstado: string,
  options?: { observacionesAppend?: string }
): Promise<CambiarEstadoOrdenPedidoResult> {
  const remote = await sfactoryService.leerOrdenPedido(orderId, companyKey);
  const estadoAnterior = parseEstadoFromOrdenResponse(remote);

  if (estadoAnterior === nuevoEstado) {
    return {
      remote,
      response: remote,
      skippedEdit: true,
      estadoAnterior,
      estadoNuevo: nuevoEstado,
    };
  }

  const editPayload = buildEditarOrdenPedidoPayload(remote, {
    orderId,
    nuevoEstado,
    observacionesAppend: options?.observacionesAppend,
  });

  const response = await sfactoryService.editarOrdenPedido(editPayload, companyKey);

  return {
    remote,
    editPayload,
    response,
    skippedEdit: false,
    estadoAnterior,
    estadoNuevo: nuevoEstado,
  };
}

/** Cotización (1) → Aprobado (2) en S-Factory. */
export async function aprobarOrdenPedidoEnSfactory(
  orderId: number,
  companyKey?: string
): Promise<CambiarEstadoOrdenPedidoResult> {
  return cambiarEstadoOrdenPedido(orderId, companyKey, SFACTORY_PE_ESTADO.aprobado);
}

/** Pasa la orden PE a estado Cancelado (default 4). */
export async function cancelarOrdenPedidoEnSfactory(
  orderId: number,
  companyKey?: string,
  motivo?: string
): Promise<CambiarEstadoOrdenPedidoResult> {
  const observacionesAppend =
    motivo != null && motivo !== '' ? `[Cancelación web] ${motivo}` : undefined;
  return cambiarEstadoOrdenPedido(orderId, companyKey, SFACTORY_PE_ESTADO.cancelado, {
    observacionesAppend,
  });
}

export function esEstadoPeAprobado(estado: string | null | undefined): boolean {
  return estado === SFACTORY_PE_ESTADO.aprobado;
}

export function esEstadoPeCotizacion(estado: string | null | undefined): boolean {
  return estado === SFACTORY_PE_ESTADO.cotizacion;
}

export function puedeReintentarAprobacionErp(pedido: {
  estadoInterno: EstadoPedido;
  sfactoryOrdenId: number | null;
  stockReservadoWeb: boolean;
}): boolean {
  return (
    pedido.estadoInterno === EstadoPedido.fallido &&
    pedido.sfactoryOrdenId != null &&
    pedido.stockReservadoWeb === true
  );
}
