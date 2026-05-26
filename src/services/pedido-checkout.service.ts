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
import { adminNotificationService } from './admin-notification.service';
import { CuponEngineService } from './cupon-engine.service';
import {
  isPedidoCheckoutEcommerce,
  sendPedidoStatusEmail,
  sendPedidoStatusEmailAsync,
} from './pedido-email-notification.service';
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
import {
  computeTotalACobrar,
  parseSfactoryEstado,
  parseSfactoryOrdenId,
  parseSfactoryTotal,
} from '../utils/sfactory-pedido-response.util';

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const cuponEngine = new CuponEngineService();

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Días de gracia para acreditar transferencia/efectivo (checkout web). Env: `CHECKOUT_MANUAL_EXPIRES_DAYS` (default 10). */
export function getCheckoutManualExpiresDays(): number {
  const n = envInt('CHECKOUT_MANUAL_EXPIRES_DAYS', 10);
  return Math.min(Math.max(n, 1), 90);
}

/** Fecha límite de pago para pedidos manuales del ecommerce. */
export function computeExpiresAtPedidoManual(fechaPedido: Date = new Date()): Date {
  return addDays(fechaPedido, getCheckoutManualExpiresDays());
}

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
    | 'pedido.sync_recovered';
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
function buildPedidoExternoParams(pedido: {
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
    observaciones: appendCuponObservaciones(
      pedido.observaciones,
      pedido.cuponCodigoSnapshot
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
 * Crea la cotización PE en S-Factory antes del cobro (checkout MP / manual web).
 * Persiste `sfactoryOrdenId`, snapshot y totales: subtotal = ERP, total = ERP + envío.
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
      sfactoryError: ordenId == null ? 'SFactory no devolvió un id de orden parseable.' : null,
      fechaEnvioSfactory: new Date(),
    },
  });

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

  await sendPedidoStatusEmail(pedidoId, OrderStatus.CONFIRMED);

  return { ok: true, pedidoId, message: 'Pedido confirmado en SFactory' };
}

export interface ProcesarPedidoResult {
  ok: boolean;
  alreadyProcessed?: boolean;
  pedidoId: number;
  message?: string;
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

  if (
    pedidoBase.estadoInterno !== EstadoPedido.pendiente_confirmacion &&
    pedidoBase.estadoInterno !== EstadoPedido.pendiente_pago
  ) {
    throw new Error(
      `Pedido ${pedidoId} no está pendiente de pago o confirmación (estado: ${pedidoBase.estadoInterno})`
    );
  }

  let payloadForLog: unknown = null;

  const pedidoStockCheck = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedidoStockCheck) throw new Error('Pedido no encontrado');

  for (const line of pedidoStockCheck.items) {
    if (line.productoWebId == null) {
      throw new Error(`Línea ${line.id} sin productoWebId; no se puede reservar stock.`);
    }
    const pw = await prisma.productoWeb.findUnique({
      where: { id: line.productoWebId },
    });
    if (!pw) throw new Error(`ProductoWeb ${line.productoWebId} no encontrado`);
    const stock = pw.stockCache ?? new Prisma.Decimal(0);
    if (stock.lt(line.cantidad)) {
      const msg = `Stock insuficiente para ${line.codigo} (disponible: ${stock}, pedido: ${line.cantidad})`;
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.fallido,
          sfactoryError: msg,
          syncStatus: PedidoSyncStatus.error,
          syncError: msg,
        },
      });
      await notifyPedidoCheckout({
        empresaId: pedidoBase.empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Pedido #${pedidoId} sin stock suficiente`,
        message: msg,
        payload: pedidoNotificationPayload(pedidoBase, {
          estadoAnterior: pedidoBase.estadoInterno,
          estadoNuevo: EstadoPedido.fallido,
          syncStatus: PedidoSyncStatus.error,
        }),
      });
      console.error(`[pedido-checkout] Stock insuficiente pedido ${pedidoId}: ${msg}`);
      return { ok: false, pedidoId, message: 'Stock insuficiente; pedido marcado como fallido.' };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.procesando,
          stockReservadoWeb: true,
          syncStatus: PedidoSyncStatus.pending,
          syncError: null,
          sfactoryExternalOrderId: `WEB-${pedidoId}`,
        },
      });

      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: true },
      });
      if (!pedido) throw new Error('Pedido no encontrado');

      for (const line of pedido.items) {
        if (line.productoWebId == null) continue;
        const updated = await tx.productoWeb.updateMany({
          where: {
            id: line.productoWebId,
            stockCache: { gte: line.cantidad },
          },
          data: {
            stockCache: { decrement: line.cantidad },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`Stock insuficiente para ${line.codigo} durante la reserva.`);
        }
      }
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
        stockReservadoWeb: false,
      },
    });
    await notifyPedidoCheckout({
      empresaId: pedidoBase.empresaId,
      type: 'pedido.sync_failed',
      pedidoId,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedidoId} no pudo reservar stock`,
      message: errMsg,
      payload: pedidoNotificationPayload(pedidoBase, {
        estadoAnterior: pedidoBase.estadoInterno,
        estadoNuevo: EstadoPedido.fallido,
        syncStatus: PedidoSyncStatus.error,
      }),
    });
    return { ok: false, pedidoId, message: errMsg };
  }

  const pedidoAfter = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true, cliente: true, empresa: true },
  });
  if (!pedidoAfter) throw new Error('Pedido no encontrado tras transacción');

  const companyKey = pedidoAfter.empresa.sfactoryCompanyKey;

  if (pedidoAfter.sfactoryOrdenId != null) {
    const ordenId = pedidoAfter.sfactoryOrdenId;
    try {
      const response = await sfactoryService.aprobarOrdenPedido(ordenId, companyKey);
      const est = parseSfactoryEstado(response) ?? pedidoAfter.sfactoryEstado;

      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.editar,
        { order_id: ordenId, accion: 'aprobar' },
        true,
        response,
        null
      );

      return finalizarPedidoConfirmadoEnSfactory({
        pedidoId,
        pedidoAfter,
        pedidoBaseEstado: pedidoBase.estadoInterno,
        sfactoryOrdenId: ordenId,
        sfactoryEstado: est,
        sfactoryExternalOrderId: pedidoAfter.sfactoryExternalOrderId ?? `WEB-${pedidoId}`,
        sfactorySnapshot:
          (response as Prisma.InputJsonValue) ??
          (pedidoAfter.sfactorySnapshot as Prisma.InputJsonValue),
        notifyTitle: `Pedido #${pedidoId} confirmado`,
        notifyMessage: `Pedido confirmado; orden SFactory ${ordenId} aprobada.`,
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
        PedidoSfactoryAccion.editar,
        { order_id: ordenId, accion: 'aprobar' },
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
    const ordenId = parseSfactoryOrdenId(response);
    const est = parseSfactoryEstado(response);

    await crearLogSfactory(pedidoId, PedidoSfactoryAccion.crear, params, true, response, null);

    if (ordenId == null) {
      console.warn(
        `[pedido-checkout] Respuesta SFactory sin id parseable para pedido ${pedidoId}:`,
        JSON.stringify(response)
      );
    }

    return finalizarPedidoConfirmadoEnSfactory({
      pedidoId,
      pedidoAfter,
      pedidoBaseEstado: pedidoBase.estadoInterno,
      sfactoryOrdenId: ordenId,
      sfactoryEstado: est,
      sfactoryExternalOrderId: params.ext_order_id,
      sfactorySnapshot: response as unknown as Prisma.InputJsonValue,
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
    include: { items: true },
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
  const manualDays = getCheckoutManualExpiresDays();
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
    include: { items: true },
  });

  for (const pedido of candidatos) {
    try {
      const ecommerce = isPedidoCheckoutEcommerce(pedido);

      if (ecommerce) {
        const motivoPago =
          pedido.estadoInterno === EstadoPedido.pendiente_pago
            ? 'No se acreditó el pago con Mercado Pago dentro del plazo.'
            : `No se acreditó el pago (transferencia/efectivo) dentro de ${manualDays} días.`;

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
