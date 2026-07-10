// src/services/pedido-checkout.service.ts
import {
  Prisma,
  EstadoPedido,
  PedidoSfactoryAccion,
  PedidoSyncStatus,
  AdminNotificationSeverity,
  FormaPago,
  OrderStatus,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { sfactoryService } from './sfactory/sfactory.service';
import {
  aprobarOrdenPedidoEnSfactory,
  cancelarOrdenPedidoEnSfactory,
  puedeReintentarAprobacionErp,
  esEstadoPeCotizacion,
} from './sfactory/sfactory-orden-pedido.service';
import { SFACTORY_PE_ESTADO } from './sfactory/sfactory-orden-pedido.config';
import { adminNotificationService } from './admin-notification.service';
import { CuponEngineService } from './cupon-engine.service';
import {
  isPedidoCheckoutEcommerce,
  sendPedidoStatusEmail,
  sendPedidoStatusEmailAsync,
} from './pedido-email-notification.service';
import { finalizeShippingAfterPaymentApproved } from './checkout-shipping-finalize.service';
import { mercadoPagoConfig } from './mercadopago/mercadopago.config';
import type {
  SFactoryCrearPedidoExternoParams,
  SFactoryPedidoExternoCliente,
  SFactoryPedidoExternoEntrega,
  SFactoryPedidoExternoItem,
} from '../types/sfactory.types';
import {
  appendCuponObservaciones,
  parseCuponDetalleSnapshot,
  sfactoryDescuentoPctFromCuponLine,
  sfactoryDescuentoPctGlobal,
} from '../utils/cupon-sfactory-payload';
import { appendBordadoObservaciones } from '../utils/pedido-bordado.util';
import {
  computeTotalACobrar,
  parseSfactoryEstado,
  parseSfactoryOrdenId,
  parseSfactoryTotal,
} from '../utils/sfactory-pedido-response.util';
import {
  debeReservarStockLocal,
  syncStockPedidoItemsAsync,
} from './sync/pedido-stock-sync.util';
import {
  computePedidoExpiresAt,
  getCheckoutExpiryWarningHours,
  getCheckoutManualExpiresHours,
  getCheckoutSfPriceAuditTolerance,
} from '../config/checkout-expires.config';
import { sendPedidoExpiringSoonEmailIfNeeded } from './pedido-expiring-email.service';
import {
  resolveCheckoutPriceMode,
  reservarStockPedidoWeb,
} from './checkout-pedido-lifecycle.service';

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function buildSfactorySnapshotWithAuditoria(
  response: unknown,
  pedido: {
    subtotal: Prisma.Decimal;
    formaPago?: FormaPago | null;
    mpPricingMode?: string | null;
  }
): Prisma.InputJsonValue {
  const sfTotal = parseSfactoryTotal(response);
  const localSubtotal = Number(pedido.subtotal);
  const delta = sfTotal != null ? Number((sfTotal - localSubtotal).toFixed(2)) : null;
  const priceMode = resolveCheckoutPriceMode(
    pedido.formaPago,
    pedido.mpPricingMode as 'transfer' | 'financiado' | null | undefined
  );
  const base =
    response && typeof response === 'object'
      ? { ...(response as Record<string, unknown>) }
      : { response };
  return {
    ...base,
    _auditoria: {
      sfTotalProductos: sfTotal,
      localSubtotal,
      delta,
      priceMode,
      formaPago: pedido.formaPago ?? null,
    },
  } as Prisma.InputJsonValue;
}

async function maybeNotifySfactoryPriceDivergence(
  pedido: { id: number; empresaId: number; clienteNombre?: string | null },
  snapshot: Prisma.InputJsonValue
): Promise<void> {
  const aud = (snapshot as Record<string, unknown>)?._auditoria as
    | { delta?: number | null; localSubtotal?: number; sfTotalProductos?: number | null }
    | undefined;
  if (aud?.delta == null || !Number.isFinite(aud.delta)) return;
  const tol = getCheckoutSfPriceAuditTolerance();
  if (Math.abs(aud.delta) <= tol) return;
  await notifyPedidoCheckout({
    empresaId: pedido.empresaId,
    type: 'pedido.price_divergence',
    pedidoId: pedido.id,
    severity: AdminNotificationSeverity.warning,
    title: `Pedido #${pedido.id}: divergencia precio S-Factory`,
    message: `Subtotal local ${aud.localSubtotal} vs SF ${aud.sfTotalProductos} (Δ ${aud.delta}).`,
    payload: {
      pedidoId: pedido.id,
      clienteNombre: pedido.clienteNombre,
      auditoria: aud,
    },
    dedupe: false,
  });
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const cuponEngine = new CuponEngineService();

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** @deprecated Usar getCheckoutManualExpiresHours desde checkout-expires.config */
export { getCheckoutManualExpiresHours };

/** @deprecated Usar computePedidoExpiresAt desde checkout-expires.config */
export function computeExpiresAtPedidoManual(fechaPedido: Date = new Date()): Date {
  return computePedidoExpiresAt(FormaPago.transferencia, fechaPedido);
}

export {
  computePedidoExpiresAt,
  getCheckoutExpiryWarningHours,
  getCheckoutSfPriceAuditTolerance,
};

function pedidoNotificationPayload(pedido: {
  empresaId?: number;
  id: number;
  estadoInterno?: EstadoPedido;
  syncStatus?: PedidoSyncStatus;
  sfactoryOrdenId?: number | null;
  total?: Prisma.Decimal | string | number;
  clienteNombre?: string;
}, extra: Record<string, unknown> = {}) {
  return {
    pedidoId: pedido.id,
    estadoNuevo: pedido.estadoInterno,
    syncStatus: pedido.syncStatus,
    sfactoryOrdenId: pedido.sfactoryOrdenId,
    total: pedido.total != null ? String(pedido.total) : undefined,
    clienteNombre: pedido.clienteNombre,
    ...extra,
  };
}

async function notifyPedidoCheckout(input: {
  empresaId: number;
  type:
    | 'pedido.payment_approved'
    | 'pedido.status_changed'
    | 'pedido.sync_failed'
    | 'pedido.cancelled'
    | 'pedido.expired'
    | 'pedido.sync_recovered'
    | 'pedido.price_divergence'
    | 'pedido.expiring_soon';
  pedidoId: number;
  title: string;
  message: string;
  severity?: AdminNotificationSeverity;
  payload?: Record<string, unknown>;
  dedupe?: boolean;
}) {
  await adminNotificationService.notifyPedido({
    empresaId: input.empresaId,
    type: input.type,
    pedidoId: input.pedidoId,
    title: input.title,
    message: input.message,
    severity: input.severity,
    payload: input.payload,
    dedupe: input.dedupe,
  });
}

async function crearLogSfactory(
  pedidoId: number,
  accion: PedidoSfactoryAccion,
  payload: unknown,
  exitoso: boolean,
  response?: unknown,
  error?: string | null,
  httpStatus?: number | null
): Promise<void> {
  try {
    await prisma.pedidoSfactoryLog.create({
      data: {
        pedidoId,
        accion,
        payload: payload as Prisma.InputJsonValue,
        response: response !== undefined ? (response as Prisma.InputJsonValue) : undefined,
        exitoso,
        error: error ?? undefined,
        httpStatus: httpStatus ?? undefined,
      },
    });
  } catch (e) {
    console.error('[pedido-checkout] Error guardando PedidoSfactoryLog:', e);
  }
}

/**
 * Payload para ventas_crear_pedido_externo desde un pedido local.
 * Si el pedido tiene cupón, envía `items[].descuento` (0–100 %) por línea según el snapshot del cupón.
 */
export function buildPedidoExternoParams(pedido: {
  id: number;
  fechaPedido: Date;
  observaciones: string | null;
  refCliente: string | null;
  numOrdenCompra: string | null;
  clienteDireccion: string | null;
  entregaCp: string | null;
  entregaNotas: string | null;
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono: string | null;
  cuponCodigoSnapshot?: string | null;
  cuponDescuentoTotal?: Prisma.Decimal | number | null;
  cuponDetalleSnapshot?: unknown;
  items: Array<{
    productoWebId?: number | null;
    codigo: string;
    nombre: string;
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
    talle: string | null;
    color: string | null;
    bordado?: boolean | null;
  }>;
  cliente: {
    cuit: string | null;
    email: string | null;
    razonSocial: string | null;
    telefono: string | null;
  } | null;
}): SFactoryCrearPedidoExternoParams {
  const source = process.env.SFACTORY_PEDIDO_EXTERNO_SOURCE;
  if (!source?.trim()) {
    throw new Error(
      'Falta SFACTORY_PEDIDO_EXTERNO_SOURCE (debe coincidir con external_orders_config en SFactory).'
    );
  }

  const c = pedido.cliente;
  const email = (c?.email?.trim() || pedido.clienteEmail.trim()) || null;
  const cuitDigits = c?.cuit?.replace(/\D/g, '') ?? '';
  const cuit = cuitDigits.length === 11 ? cuitDigits : undefined;
  if (!cuit && !email) {
    throw new Error(
      'El pedido no tiene cuit (11 dígitos) ni email; SFactory no puede resolver el cliente.'
    );
  }

  const fecha = formatDateOnly(pedido.fechaPedido);
  const fechaEntrega = formatDateOnly(addDays(pedido.fechaPedido, 7));

  const nombreRs =
    (c?.razonSocial?.trim() || pedido.clienteNombre.trim()) || undefined;
  const tel = c?.telefono?.trim() || pedido.clienteTelefono?.trim() || undefined;

  const clientePayload: SFactoryPedidoExternoCliente = {
    ...(cuit ? { cuit } : {}),
    ...(email ? { email } : {}),
    ...(nombreRs ? { nombre: nombreRs } : {}),
    ...(tel ? { telefono: tel } : {}),
  };

  if (!pedido.items.length) {
    throw new Error('El pedido no tiene ítems.');
  }

  const cuponDetalle = parseCuponDetalleSnapshot(pedido.cuponDetalleSnapshot);
  const cuponDescuentoTotal = Number(pedido.cuponDescuentoTotal ?? 0);
  const subtotalLineas = pedido.items.reduce(
    (sum, line) => sum + Number(line.precioUnitario) * Number(line.cantidad),
    0
  );
  const descuentoGlobalPct =
    !cuponDetalle && cuponDescuentoTotal > 0
      ? sfactoryDescuentoPctGlobal(subtotalLineas, cuponDescuentoTotal)
      : undefined;

  const itemsOut: SFactoryPedidoExternoItem[] = pedido.items.map((line) => {
    const espec = [line.talle, line.color].filter(Boolean).join(' / ');
    const descuentoPct =
      sfactoryDescuentoPctFromCuponLine(line.productoWebId, cuponDetalle) ?? descuentoGlobalPct;

    return {
      sku: line.codigo.trim(),
      cantidad: Number(line.cantidad),
      precio: Number(line.precioUnitario),
      ...(descuentoPct !== undefined ? { descuento: descuentoPct } : {}),
      descripcion: line.nombre,
      fecha_entrega: fechaEntrega,
      ...(espec ? { especificaciones: espec } : {}),
      ...(line.bordado ? { notas: 'Bordado: SÍ' } : {}),
    };
  });

  let entrega: SFactoryPedidoExternoEntrega | undefined;
  const dir = pedido.clienteDireccion?.trim();
  const cp = pedido.entregaCp?.trim();
  if (dir && cp) {
    entrega = {
      provincia: process.env.SFACTORY_ENTREGA_PROVINCIA_DEFAULT ?? 'Cordoba',
      localidad: process.env.SFACTORY_ENTREGA_LOCALIDAD_DEFAULT ?? '',
      direccion: dir,
      cp,
      ...(pedido.entregaNotas?.trim() ? { notas: pedido.entregaNotas.trim() } : {}),
    };
  }

  const tuple = itemsOut as [
    SFactoryPedidoExternoItem,
    ...SFactoryPedidoExternoItem[],
  ];

  return {
    source: source.trim(),
    ext_order_id: `WEB-${pedido.id}`,
    fecha,
    fecha_entrega: fechaEntrega,
    titulo: `Pedido web #${pedido.id}`,
    observaciones: appendBordadoObservaciones(
      appendCuponObservaciones(
        pedido.observaciones,
        pedido.cuponCodigoSnapshot
      ),
      pedido.items.map((line) => ({
        nombre: line.nombre,
        cantidad: Number(line.cantidad),
        bordado: line.bordado,
      }))
    ),
    ref_cliente: pedido.refCliente ?? String(pedido.id),
    num_orden_compra: pedido.numOrdenCompra ?? undefined,
    cliente: clientePayload,
    items: tuple,
    ...(entrega ? { entrega } : {}),
  };
}

export interface RegistrarCotizacionSfactoryResult {
  sfactoryOrdenId: number | null;
  sfactoryEstado: string | null;
  /** Total productos según `response.total` de ventas_crear_pedido_externo. */
  sfactoryTotalProductos: number;
  /** Productos ERP + envío postal (GND). */
  totalACobrar: number;
}

/**
 * @deprecated Pre-cotización S-Factory eliminada del checkout web. Solo legacy/scripts.
 * Crea la cotización PE en S-Factory antes del cobro.
 */
export async function registrarCotizacionSfactoryParaPedido(
  pedidoId: number
): Promise<RegistrarCotizacionSfactoryResult> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true, cliente: true, empresa: true },
  });
  if (!pedido) {
    throw new Error(`Pedido ${pedidoId} no encontrado`);
  }

  const costoEnvio = Number(pedido.costoEnvio ?? 0);

  if (pedido.sfactoryOrdenId != null) {
    const subtotal = Number(pedido.subtotal);
    return {
      sfactoryOrdenId: pedido.sfactoryOrdenId,
      sfactoryEstado: pedido.sfactoryEstado,
      sfactoryTotalProductos: subtotal,
      totalACobrar: computeTotalACobrar(subtotal, costoEnvio),
    };
  }

  const params = buildPedidoExternoParams(pedido);
  const companyKey = pedido.empresa.sfactoryCompanyKey;
  const response = await sfactoryService.crearPedidoExterno(params, companyKey);
  const ordenId = parseSfactoryOrdenId(response);
  const est = parseSfactoryEstado(response);
  const sfactoryTotal = parseSfactoryTotal(response);

  if (sfactoryTotal == null) {
    throw new Error(
      'S-Factory no devolvió total parseable en ventas_crear_pedido_externo.'
    );
  }

  if (ordenId == null) {
    const msg = 'SFactory no devolvio ID de orden; no se puede cobrar el pedido';
    await crearLogSfactory(
      pedidoId,
      PedidoSfactoryAccion.crear,
      params,
      false,
      response,
      msg
    );
    throw new Error(msg);
  }

  const totalACobrar = computeTotalACobrar(sfactoryTotal, costoEnvio);

  await crearLogSfactory(pedidoId, PedidoSfactoryAccion.crear, params, true, response, null);

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      sfactoryOrdenId: ordenId ?? undefined,
      sfactoryEstado: est ?? undefined,
      sfactoryExternalOrderId: params.ext_order_id,
      sfactorySnapshot: response as unknown as Prisma.InputJsonValue,
      subtotal: new Prisma.Decimal(sfactoryTotal),
      total: new Prisma.Decimal(totalACobrar),
      syncStatus: PedidoSyncStatus.pending,
      sfactoryError: null,
      fechaEnvioSfactory: new Date(),
    },
  });

  syncStockPedidoItemsAsync(pedidoId);

  return {
    sfactoryOrdenId: ordenId,
    sfactoryEstado: est,
    sfactoryTotalProductos: sfactoryTotal,
    totalACobrar,
  };
}

async function finalizarPedidoConfirmadoEnSfactory(input: {
  pedidoId: number;
  pedidoAfter: {
    id: number;
    empresaId: number;
    estadoInterno: EstadoPedido;
    cuponId: number | null;
    usuarioId: number | null;
    clienteId: number | null;
    cuponDescuentoTotal: Prisma.Decimal | null;
  };
  pedidoBaseEstado: EstadoPedido;
  sfactoryOrdenId: number | null;
  sfactoryEstado: string | null;
  sfactoryExternalOrderId: string;
  sfactorySnapshot: Prisma.InputJsonValue;
  notifyTitle: string;
  notifyMessage: string;
}): Promise<ProcesarPedidoResult> {
  const {
    pedidoId,
    pedidoAfter,
    pedidoBaseEstado,
    sfactoryOrdenId,
    sfactoryEstado,
    sfactoryExternalOrderId,
    sfactorySnapshot,
    notifyTitle,
    notifyMessage,
  } = input;

  const updated = await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      estadoInterno: EstadoPedido.confirmado,
      sfactoryOrdenId: sfactoryOrdenId ?? undefined,
      sfactoryEstado: sfactoryEstado ?? undefined,
      sfactoryExternalOrderId,
      syncStatus: sfactoryOrdenId == null ? PedidoSyncStatus.error : PedidoSyncStatus.synced,
      syncError: sfactoryOrdenId == null ? 'SFactory no devolvió un id de orden parseable.' : null,
      sfactorySyncedAt: sfactoryOrdenId == null ? undefined : new Date(),
      sfactorySnapshot,
      fechaConfirmacion: new Date(),
      fechaEnvioSfactory: new Date(),
      sfactoryError: null,
    },
  });

  if (sfactoryOrdenId == null) {
    await notifyPedidoCheckout({
      empresaId: pedidoAfter.empresaId,
      type: 'pedido.sync_failed',
      pedidoId,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedidoId} confirmado sin ID SFactory`,
      message: 'SFactory respondió, pero no devolvió un id de orden parseable.',
      payload: pedidoNotificationPayload(updated, {
        estadoAnterior: pedidoBaseEstado,
        estadoNuevo: updated.estadoInterno,
      }),
    });
  } else {
    await notifyPedidoCheckout({
      empresaId: pedidoAfter.empresaId,
      type: 'pedido.status_changed',
      pedidoId,
      severity: AdminNotificationSeverity.success,
      title: notifyTitle,
      message: notifyMessage,
      payload: pedidoNotificationPayload(updated, {
        estadoAnterior: pedidoBaseEstado,
        estadoNuevo: updated.estadoInterno,
      }),
      dedupe: false,
    });
  }

  if (pedidoAfter.cuponId) {
    await cuponEngine.registrarUso({
      cuponId: pedidoAfter.cuponId,
      pedidoId,
      usuarioId: pedidoAfter.usuarioId ?? undefined,
      clienteId: pedidoAfter.clienteId ?? undefined,
      descuento: Number(pedidoAfter.cuponDescuentoTotal ?? 0),
    });
    console.log(`[cupon] Uso registrado para cupón ${pedidoAfter.cuponId}, pedido ${pedidoId}`);
  }

  await finalizeShippingAfterPaymentApproved(pedidoId);
  await sendPedidoStatusEmail(pedidoId, OrderStatus.CONFIRMED);

  syncStockPedidoItemsAsync(pedidoId);

  await maybeNotifySfactoryPriceDivergence(
    { id: pedidoId, empresaId: pedidoAfter.empresaId },
    sfactorySnapshot
  );

  return { ok: true, pedidoId, message: 'Pedido confirmado en SFactory' };
}

export interface ProcesarPedidoResult {
  ok: boolean;
  alreadyProcessed?: boolean;
  pedidoId: number;
  message?: string;
}

function mpPagoAprobado(pedido: {
  formaPago?: FormaPago | null;
  mercadoPagoStatus?: string | null;
  mercadoPagoPaymentId?: string | null;
}): boolean {
  return (
    pedido.formaPago === FormaPago.mercado_pago &&
    pedido.mercadoPagoStatus === 'approved' &&
    pedido.mercadoPagoPaymentId != null
  );
}

export async function cancelarCotizacionSfactoryImpaga(input: {
  pedido: {
    id: number;
    empresaId: number;
    estadoInterno: EstadoPedido;
    formaPago?: FormaPago | null;
    mercadoPagoStatus?: string | null;
    mercadoPagoPaymentId?: string | null;
    sfactoryOrdenId: number | null;
    clienteNombre?: string | null;
  };
  companyKey?: string | null;
  motivo: string;
}): Promise<{ ok: true; response?: unknown } | { ok: false; error: string }> {
  const { pedido, companyKey, motivo } = input;
  if (pedido.sfactoryOrdenId == null) return { ok: true };
  if (mpPagoAprobado(pedido)) {
    return { ok: false, error: 'El pago MP ya esta aprobado; no se cancela PE automaticamente.' };
  }

  const readPayload = { orderId: pedido.sfactoryOrdenId, motivo };
  try {
    const result = await cancelarOrdenPedidoEnSfactory(
      pedido.sfactoryOrdenId,
      companyKey ?? undefined,
      motivo
    );
    await crearLogSfactory(pedido.id, PedidoSfactoryAccion.leer, readPayload, true, result.remote, null);
    await crearLogSfactory(
      pedido.id,
      PedidoSfactoryAccion.editar,
      result.editPayload ?? { skippedEdit: result.skippedEdit, estado: SFACTORY_PE_ESTADO.cancelado },
      true,
      result.response,
      null
    );
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoErp: OrderStatus.CANCELLED,
        sfactoryEstado: SFACTORY_PE_ESTADO.cancelado,
        syncStatus: PedidoSyncStatus.synced,
        syncError: null,
        sfactorySyncedAt: new Date(),
        sfactorySnapshot: result.response as Prisma.InputJsonValue,
      },
    });
    return { ok: true, response: result.response };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await crearLogSfactory(pedido.id, PedidoSfactoryAccion.editar, readPayload, false, undefined, msg);
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        syncStatus: PedidoSyncStatus.error,
        syncError: msg,
      },
    });
    await notifyPedidoCheckout({
      empresaId: pedido.empresaId,
      type: 'pedido.sync_failed',
      pedidoId: pedido.id,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedido.id}: no se pudo cancelar PE SFactory`,
      message: msg,
      payload: pedidoNotificationPayload(
        {
          id: pedido.id,
          estadoInterno: pedido.estadoInterno,
          syncStatus: PedidoSyncStatus.error,
          sfactoryOrdenId: pedido.sfactoryOrdenId,
          clienteNombre: pedido.clienteNombre ?? undefined,
        },
        { motivo }
      ),
      dedupe: false,
    });
    return { ok: false, error: msg };
  }
}

/**
 * Confirmación final: stock web, creación de orden en SFactory, estado confirmado o fallido.
 * Idempotente si el pedido ya está confirmado / en curso logístico.
 */
export async function procesarPedidoConfirmado(pedidoId: number): Promise<ProcesarPedidoResult> {
  const pedidoBase = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      items: true,
      cliente: true,
      empresa: true,
    },
  });

  if (!pedidoBase) {
    throw new Error(`Pedido ${pedidoId} no encontrado`);
  }

  const terminalOk: EstadoPedido[] = [
    EstadoPedido.confirmado,
    EstadoPedido.procesando,
    EstadoPedido.despachado,
    EstadoPedido.entregado,
  ];
  if (terminalOk.includes(pedidoBase.estadoInterno)) {
    return { ok: true, alreadyProcessed: true, pedidoId };
  }

  if (
    pedidoBase.estadoInterno === EstadoPedido.cancelado ||
    pedidoBase.estadoInterno === EstadoPedido.vencido
  ) {
    throw new Error(
      `Pedido ${pedidoId} no puede confirmarse (estado: ${pedidoBase.estadoInterno})`
    );
  }

  const esReintentoAprobacionErp = puedeReintentarAprobacionErp(pedidoBase);
  const reservarStockLocal = debeReservarStockLocal({
    esReintentoAprobacionErp,
    stockReservadoWeb: pedidoBase.stockReservadoWeb,
  });

  const estadosEntradaValidos: EstadoPedido[] = [
    EstadoPedido.pendiente_confirmacion,
    EstadoPedido.pendiente_pago,
  ];
  if (!estadosEntradaValidos.includes(pedidoBase.estadoInterno) && !esReintentoAprobacionErp) {
    throw new Error(
      `Pedido ${pedidoId} no está pendiente de pago o confirmación (estado: ${pedidoBase.estadoInterno})`
    );
  }

  let payloadForLog: unknown = null;

  if (reservarStockLocal) {
    const stockRes = await reservarStockPedidoWeb(pedidoId, {
      empresaId: pedidoBase.empresaId,
      marcarProcesando: true,
    });
    if (!stockRes.ok) {
      return { ok: false, pedidoId, message: stockRes.message ?? 'Stock insuficiente.' };
    }
  } else {
    await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        syncStatus: PedidoSyncStatus.pending,
        syncError: null,
        ...(pedidoBase.estadoInterno !== EstadoPedido.procesando
          ? { estadoInterno: EstadoPedido.procesando }
          : {}),
      },
    });
  }

  const pedidoAfter = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true, cliente: true, empresa: true },
  });
  if (!pedidoAfter) throw new Error('Pedido no encontrado tras transacción');

  const companyKey = pedidoAfter.empresa.sfactoryCompanyKey;

  if (pedidoAfter.sfactoryOrdenId != null) {
    const ordenId = pedidoAfter.sfactoryOrdenId;
    const readPayload = { order_id: ordenId, accion: 'aprobar', estadoDestino: SFACTORY_PE_ESTADO.aprobado };
    try {
      const sfResult = await aprobarOrdenPedidoEnSfactory(ordenId, companyKey);
      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.leer,
        readPayload,
        true,
        sfResult.remote,
        null
      );
      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.editar,
        sfResult.editPayload ?? { skippedEdit: sfResult.skippedEdit, estado: SFACTORY_PE_ESTADO.aprobado },
        true,
        sfResult.response,
        null
      );

      const est =
        parseSfactoryEstado(sfResult.response) ??
        SFACTORY_PE_ESTADO.aprobado;

      const snapshotAuditoria = buildSfactorySnapshotWithAuditoria(
        sfResult.response ?? sfResult.remote,
        pedidoAfter
      );

      return finalizarPedidoConfirmadoEnSfactory({
        pedidoId,
        pedidoAfter,
        pedidoBaseEstado: pedidoBase.estadoInterno,
        sfactoryOrdenId: ordenId,
        sfactoryEstado: est,
        sfactoryExternalOrderId: pedidoAfter.sfactoryExternalOrderId ?? `WEB-${pedidoId}`,
        sfactorySnapshot: snapshotAuditoria,
        notifyTitle: `Pedido #${pedidoId} confirmado`,
        notifyMessage: `Pedido confirmado; orden SFactory ${ordenId} aprobada (estado ${est}).`,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.fallido,
          sfactoryError: errMsg,
          syncStatus: PedidoSyncStatus.error,
          syncError: errMsg,
          sfactoryIntentos: { increment: 1 },
          stockReservadoWeb: true,
        },
      });
      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.editar,
        readPayload,
        false,
        undefined,
        errMsg
      );
      await notifyPedidoCheckout({
        empresaId: pedidoAfter.empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Pedido #${pedidoId} falló al aprobar en SFactory`,
        message: errMsg,
        payload: pedidoNotificationPayload(pedidoAfter, {
          estadoAnterior: pedidoBase.estadoInterno,
          estadoNuevo: EstadoPedido.fallido,
          syncStatus: PedidoSyncStatus.error,
        }),
      });
      console.error(`[pedido-checkout] Error aprobar SFactory pedido ${pedidoId}:`, errMsg);
      return { ok: false, pedidoId, message: errMsg };
    }
  }

  let params: SFactoryCrearPedidoExternoParams;
  try {
    params = buildPedidoExternoParams(pedidoAfter);
    payloadForLog = params;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await prisma.$transaction(async (tx) => {
      const items = await tx.pedidoItem.findMany({ where: { pedidoId } });
      for (const line of items) {
        if (line.productoWebId == null) continue;
        await tx.productoWeb.update({
          where: { id: line.productoWebId },
          data: { stockCache: { increment: line.cantidad } },
        });
      }
      await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.fallido,
          sfactoryError: errMsg,
          syncStatus: PedidoSyncStatus.error,
          syncError: errMsg,
          stockReservadoWeb: false,
        },
      });
    });
    await crearLogSfactory(
      pedidoId,
      PedidoSfactoryAccion.crear,
      { error: errMsg },
      false,
      undefined,
      errMsg
    );
    await notifyPedidoCheckout({
      empresaId: pedidoAfter.empresaId,
      type: 'pedido.sync_failed',
      pedidoId,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedidoId} con payload inválido para SFactory`,
      message: errMsg,
      payload: pedidoNotificationPayload(pedidoAfter, {
        estadoAnterior: pedidoBase.estadoInterno,
        estadoNuevo: EstadoPedido.fallido,
        syncStatus: PedidoSyncStatus.error,
      }),
    });
    throw e;
  }

  try {
    const response = await sfactoryService.crearPedidoExterno(params, companyKey);
    let ordenId = parseSfactoryOrdenId(response);
    let est = parseSfactoryEstado(response);
    let snapshotSource: unknown = response;

    await crearLogSfactory(pedidoId, PedidoSfactoryAccion.crear, params, true, response, null);

    if (ordenId == null) {
      console.warn(
        `[pedido-checkout] Respuesta SFactory sin id parseable para pedido ${pedidoId}:`,
        JSON.stringify(response)
      );
    } else if (esEstadoPeCotizacion(est)) {
      const sfResult = await aprobarOrdenPedidoEnSfactory(ordenId, companyKey);
      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.editar,
        sfResult.editPayload ?? { estado: SFACTORY_PE_ESTADO.aprobado },
        true,
        sfResult.response,
        null
      );
      est = parseSfactoryEstado(sfResult.response) ?? SFACTORY_PE_ESTADO.aprobado;
      snapshotSource = sfResult.response ?? response;
    }

    const snapshotAuditoria = buildSfactorySnapshotWithAuditoria(snapshotSource, pedidoAfter);

    return finalizarPedidoConfirmadoEnSfactory({
      pedidoId,
      pedidoAfter,
      pedidoBaseEstado: pedidoBase.estadoInterno,
      sfactoryOrdenId: ordenId,
      sfactoryEstado: est,
      sfactoryExternalOrderId: params.ext_order_id,
      sfactorySnapshot: snapshotAuditoria,
      notifyTitle: `Pedido #${pedidoId} confirmado`,
      notifyMessage: `Pedido confirmado y sincronizado con SFactory (orden ${ordenId ?? '—'}).`,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        estadoInterno: EstadoPedido.fallido,
        sfactoryError: errMsg,
        syncStatus: PedidoSyncStatus.error,
        syncError: errMsg,
        sfactoryIntentos: { increment: 1 },
      },
    });
    await crearLogSfactory(
      pedidoId,
      PedidoSfactoryAccion.crear,
      payloadForLog ?? params,
      false,
      undefined,
      errMsg
    );
    await notifyPedidoCheckout({
      empresaId: pedidoAfter.empresaId,
      type: 'pedido.sync_failed',
      pedidoId,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedidoId} falló al sincronizar con SFactory`,
      message: errMsg,
      payload: pedidoNotificationPayload(pedidoAfter, {
        estadoAnterior: pedidoBase.estadoInterno,
        estadoNuevo: EstadoPedido.fallido,
        syncStatus: PedidoSyncStatus.error,
      }),
    });
    console.error(`[pedido-checkout] Error SFactory pedido ${pedidoId}:`, errMsg);
    return { ok: false, pedidoId, message: errMsg };
  }
}

export async function listarPedidosPendientesConfirmacion() {
  return prisma.pedido.findMany({
    where: { estadoInterno: EstadoPedido.pendiente_confirmacion },
    orderBy: { fechaPedido: 'asc' },
    include: {
      items: true,
      cliente: { select: { id: true, razonSocial: true, sfactoryId: true } },
    },
  });
}

async function devolverStockPedidoItems(
  tx: Prisma.TransactionClient,
  pedidoId: number
): Promise<void> {
  const p = await tx.pedido.findUnique({ where: { id: pedidoId } });
  if (!p?.stockReservadoWeb) return;

  const items = await tx.pedidoItem.findMany({ where: { pedidoId } });
  for (const line of items) {
    if (line.productoWebId == null) continue;
    await tx.productoWeb.update({
      where: { id: line.productoWebId },
      data: { stockCache: { increment: line.cantidad } },
    });
  }
  await tx.pedido.update({
    where: { id: pedidoId },
    data: { stockReservadoWeb: false },
  });
}

export async function rechazarPedido(pedidoId: number, motivo?: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true, empresa: true },
  });
  if (!pedido) throw new Error('Pedido no encontrado');

  const permitidos: EstadoPedido[] = [
    EstadoPedido.pendiente_confirmacion,
    EstadoPedido.pendiente_pago,
  ];
  if (!permitidos.includes(pedido.estadoInterno)) {
    throw new Error(
      `No se puede rechazar un pedido en estado ${pedido.estadoInterno}`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await devolverStockPedidoItems(tx, pedidoId);
    return tx.pedido.update({
      where: { id: pedidoId },
      data: {
        estadoInterno: EstadoPedido.cancelado,
        observaciones: motivo
          ? `${pedido.observaciones ?? ''}\n[Rechazo admin] ${motivo}`.trim()
          : pedido.observaciones,
      },
      include: { items: true },
    });
  });

  await notifyPedidoCheckout({
    empresaId: pedido.empresaId,
    type: 'pedido.cancelled',
    pedidoId,
    severity: AdminNotificationSeverity.warning,
    title: `Pedido #${pedidoId} cancelado`,
    message: motivo ? `Pedido cancelado: ${motivo}` : 'Pedido cancelado desde administración.',
    payload: pedidoNotificationPayload(updated, {
      estadoAnterior: pedido.estadoInterno,
      estadoNuevo: updated.estadoInterno,
    }),
    dedupe: false,
  });

  sendPedidoStatusEmailAsync(pedidoId, OrderStatus.CANCELLED, {
    notes: updated.observaciones ?? undefined,
  });

  syncStockPedidoItemsAsync(pedidoId);

  return updated;
}

/** Job: reintentar creación en SFactory para pedidos fallidos sin orden remota. */
export async function reintentarFallidosSfactory(): Promise<void> {
  const maxIntentos = envInt('SFACTORY_PEDIDO_MAX_REINTENTOS', 3);
  const rows = await prisma.pedido.findMany({
    where: {
      estadoInterno: EstadoPedido.fallido,
      sfactoryIntentos: { gte: 1, lt: maxIntentos },
      sfactoryOrdenId: null,
    },
    include: { items: true, cliente: true, empresa: true },
    take: 50,
  });

  for (const pedido of rows) {
    if (
      pedido.estadoInterno !== EstadoPedido.fallido ||
      pedido.sfactoryOrdenId != null
    ) {
      continue;
    }

    let params: SFactoryCrearPedidoExternoParams;
    try {
      params = buildPedidoExternoParams(pedido);
    } catch (e) {
      console.error(`[pedido-checkout] reintento build payload pedido ${pedido.id}:`, e);
      continue;
    }

    const companyKey = pedido.empresa.sfactoryCompanyKey;

    try {
      const response = await sfactoryService.crearPedidoExterno(params, companyKey);
      const ordenId = parseSfactoryOrdenId(response);
      const est = parseSfactoryEstado(response);

      await crearLogSfactory(
        pedido.id,
        PedidoSfactoryAccion.reintento,
        params,
        true,
        response,
        null
      );

      const updated = await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          estadoInterno: EstadoPedido.confirmado,
          sfactoryOrdenId: ordenId ?? undefined,
          sfactoryEstado: est ?? undefined,
          sfactoryExternalOrderId: params.ext_order_id,
          syncStatus: ordenId == null ? PedidoSyncStatus.error : PedidoSyncStatus.synced,
          syncError: ordenId == null ? 'SFactory no devolvió un id de orden parseable.' : null,
          sfactorySyncedAt: ordenId == null ? undefined : new Date(),
          sfactorySnapshot: response as unknown as Prisma.InputJsonValue,
          fechaConfirmacion: new Date(),
          fechaEnvioSfactory: new Date(),
          sfactoryError: null,
        },
      });
      if (ordenId == null) {
        await notifyPedidoCheckout({
          empresaId: pedido.empresaId,
          type: 'pedido.sync_failed',
          pedidoId: pedido.id,
          severity: AdminNotificationSeverity.error,
          title: `Pedido #${pedido.id} reintentado sin ID SFactory`,
          message: 'SFactory respondió el reintento, pero no devolvió un id de orden parseable.',
          payload: pedidoNotificationPayload(updated, {
            estadoAnterior: pedido.estadoInterno,
            estadoNuevo: updated.estadoInterno,
          }),
        });
      } else {
        await notifyPedidoCheckout({
          empresaId: pedido.empresaId,
          type: 'pedido.sync_recovered',
          pedidoId: pedido.id,
          severity: AdminNotificationSeverity.success,
          title: `Pedido #${pedido.id} recuperado en SFactory`,
          message: `El reintento creó la orden ${ordenId} en SFactory.`,
          payload: pedidoNotificationPayload(updated, {
            estadoAnterior: pedido.estadoInterno,
            estadoNuevo: updated.estadoInterno,
          }),
          dedupe: false,
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const next = pedido.sfactoryIntentos + 1;
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          sfactoryIntentos: { increment: 1 },
          sfactoryError: errMsg,
          syncStatus: PedidoSyncStatus.error,
          syncError: errMsg,
        },
      });
      await crearLogSfactory(
        pedido.id,
        PedidoSfactoryAccion.reintento,
        params,
        false,
        undefined,
        errMsg
      );
      if (next >= maxIntentos) {
        console.error(
          `[pedido-checkout] Reintentos agotados para pedido ${pedido.id} (SFactory)`
        );
      }
      await notifyPedidoCheckout({
        empresaId: pedido.empresaId,
        type: 'pedido.sync_failed',
        pedidoId: pedido.id,
        severity: AdminNotificationSeverity.error,
        title: `Pedido #${pedido.id} sigue fallando en SFactory`,
        message: errMsg,
        payload: pedidoNotificationPayload(pedido, {
          estadoAnterior: pedido.estadoInterno,
          estadoNuevo: pedido.estadoInterno,
          syncStatus: PedidoSyncStatus.error,
          intento: next,
          maxIntentos,
        }),
      });
    }
  }
}

/** Job: cerrar pedidos ecommerce sin pago (transferencia/efectivo/MP) tras `expiresAt`. */
export async function procesarPedidosVencidos(): Promise<void> {
  const now = new Date();
  const manualHours = getCheckoutManualExpiresHours();
  const mpTimeoutMs = mercadoPagoConfig.getCheckoutMpPendingTimeoutMinutes() * 60 * 1000;
  const mpFallbackCutoff = new Date(now.getTime() - mpTimeoutMs);

  const candidatos = await prisma.pedido.findMany({
    where: {
      OR: [
        {
          expiresAt: { lt: now },
          OR: [
            { estadoInterno: EstadoPedido.pendiente_confirmacion },
            {
              estadoInterno: EstadoPedido.pendiente_pago,
              formaPago: FormaPago.mercado_pago,
              NOT: {
                mercadoPagoStatus: 'approved',
                mercadoPagoPaymentId: { not: null },
              },
            },
          ],
        },
        {
          estadoInterno: EstadoPedido.pendiente_pago,
          formaPago: FormaPago.mercado_pago,
          sfactoryOrdenId: null,
          mercadoPagoPaymentId: null,
          fechaPedido: { lt: mpFallbackCutoff },
        },
      ],
    },
    include: { items: true, empresa: true },
  });

  for (const pedido of candidatos) {
    try {
      const ecommerce = isPedidoCheckoutEcommerce(pedido);

      if (ecommerce) {
        const motivoPago =
          pedido.estadoInterno === EstadoPedido.pendiente_pago
            ? 'No se acreditó el pago con Mercado Pago dentro del plazo.'
            : `No se acreditó el pago (transferencia/efectivo) dentro de ${manualHours} horas.`;

        await prisma.$transaction(async (tx) => {
          await devolverStockPedidoItems(tx, pedido.id);
          await tx.pedido.update({
            where: { id: pedido.id },
            data: {
              estadoInterno: EstadoPedido.cancelado,
              observaciones: `${pedido.observaciones ?? ''}\n[Vencimiento automático] ${motivoPago}`.trim(),
              syncStatus: PedidoSyncStatus.synced,
              syncError: null,
            },
          });
        });

        await cancelarCotizacionSfactoryImpaga({
          pedido,
          companyKey: pedido.empresa.sfactoryCompanyKey,
          motivo: motivoPago,
        });

        await crearLogSfactory(
          pedido.id,
          PedidoSfactoryAccion.vencido,
          { motivo: motivoPago, expiresAt: pedido.expiresAt, ecommerce: true },
          true,
          { estado: EstadoPedido.cancelado },
          null
        );

        await notifyPedidoCheckout({
          empresaId: pedido.empresaId,
          type: 'pedido.cancelled',
          pedidoId: pedido.id,
          severity: AdminNotificationSeverity.warning,
          title: `Pedido #${pedido.id} cancelado por falta de pago`,
          message: motivoPago,
          payload: pedidoNotificationPayload(pedido, {
            estadoAnterior: pedido.estadoInterno,
            estadoNuevo: EstadoPedido.cancelado,
            expiresAt: pedido.expiresAt,
          }),
          dedupe: false,
        });

        sendPedidoStatusEmailAsync(pedido.id, OrderStatus.CANCELLED, { notes: motivoPago });
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await devolverStockPedidoItems(tx, pedido.id);
        await tx.pedido.update({
          where: { id: pedido.id },
          data: { estadoInterno: EstadoPedido.vencido },
        });
      });
      await crearLogSfactory(
        pedido.id,
        PedidoSfactoryAccion.vencido,
        { motivo: 'expiresAt superado', expiresAt: pedido.expiresAt },
        true,
        { estado: EstadoPedido.vencido },
        null
      );
      await notifyPedidoCheckout({
        empresaId: pedido.empresaId,
        type: 'pedido.expired',
        pedidoId: pedido.id,
        severity: AdminNotificationSeverity.warning,
        title: `Pedido #${pedido.id} vencido`,
        message: 'El pedido venció sin confirmación (carga administrativa).',
        payload: pedidoNotificationPayload(pedido, {
          estadoAnterior: pedido.estadoInterno,
          estadoNuevo: EstadoPedido.vencido,
          expiresAt: pedido.expiresAt,
        }),
        dedupe: false,
      });
    } catch (e) {
      console.error(`[pedido-checkout] Error venciendo pedido ${pedido.id}:`, e);
    }
  }
}

/** Avisa pedidos ecommerce próximos a vencer (dentro de CHECKOUT_EXPIRY_WARNING_HOURS). */
export async function avisarPedidosProximosAVencer(): Promise<void> {
  const now = new Date();
  const warningMs = getCheckoutExpiryWarningHours() * 60 * 60 * 1000;
  const until = new Date(now.getTime() + warningMs);
  const dedupeSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const pedidos = await prisma.pedido.findMany({
    where: {
      estadoInterno: {
        in: [EstadoPedido.pendiente_pago, EstadoPedido.pendiente_confirmacion],
      },
      expiresAt: { gt: now, lte: until },
      usuarioId: { not: null },
    },
    select: {
      id: true,
      empresaId: true,
      clienteNombre: true,
      clienteEmail: true,
      total: true,
      expiresAt: true,
      estadoInterno: true,
      formaPago: true,
    },
  });

  for (const pedido of pedidos) {
    try {
      const existingAdmin = await prisma.adminNotification.findFirst({
        where: {
          empresaId: pedido.empresaId,
          type: 'pedido.expiring_soon',
          entityId: String(pedido.id),
          createdAt: { gte: dedupeSince },
        },
      });

      if (!existingAdmin) {
        const expiresLabel = pedido.expiresAt?.toISOString() ?? '—';
        await notifyPedidoCheckout({
          empresaId: pedido.empresaId,
          type: 'pedido.expiring_soon',
          pedidoId: pedido.id,
          severity: AdminNotificationSeverity.warning,
          title: `Pedido #${pedido.id} vence pronto`,
          message: `El pedido de ${pedido.clienteNombre ?? 'cliente'} vence el ${expiresLabel}.`,
          payload: {
            pedidoId: pedido.id,
            expiresAt: pedido.expiresAt,
            estadoInterno: pedido.estadoInterno,
            formaPago: pedido.formaPago,
          },
          dedupe: false,
        });
      }

      await sendPedidoExpiringSoonEmailIfNeeded(pedido, dedupeSince);
    } catch (e) {
      console.error(`[pedido-checkout] Error aviso vencimiento pedido ${pedido.id}:`, e);
    }
  }
}
