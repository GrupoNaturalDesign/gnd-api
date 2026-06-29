import {
  EstadoPedido,
  FormaPago,
  OrderStatus,
  PedidoSfactoryAccion,
  PedidoSyncStatus,
  Prisma,
  AdminNotificationSeverity,
} from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sfactoryService } from './sfactory/sfactory.service';
import {
  cancelarOrdenPedidoEnSfactory,
  parseEstadoFromOrdenResponse,
  puedeReintentarAprobacionErp,
} from './sfactory/sfactory-orden-pedido.service';
import { SFACTORY_PE_ESTADO } from './sfactory/sfactory-orden-pedido.config';
import { stockPreciosSyncService } from './sync/stock-precios-sync.service';
import { syncStockPedidoItemsAsync } from './sync/pedido-stock-sync.util';
import { adminNotificationService } from './admin-notification.service';
import {
  computeExpiresAtPedidoManual,
  procesarPedidoConfirmado,
  reintentarFallidosSfactory,
} from './pedido-checkout.service';
import { sendPedidoStatusEmailAsync } from './pedido-email-notification.service';
import { stableHash } from '../utils/sync-hash.utils';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

export const pedidoListQuerySchema = z.object({
  estado: z.nativeEnum(EstadoPedido).optional(),
  syncStatus: z.nativeEnum(PedidoSyncStatus).optional(),
  desde: dateOnly,
  hasta: dateOnly,
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().max(10_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const pedidoManualItemSchema = z.object({
  productoWebId: z.number().int().positive().optional(),
  productoPadreId: z.number().int().positive().optional(),
  sfactoryItemId: z.number().int().positive(),
  nombre: z.string().trim().min(1).max(500),
  codigo: z.string().trim().min(1).max(100),
  cantidad: z.number().positive().finite().max(1_000_000),
  precioUnitario: z.number().nonnegative().finite(),
  talle: z.string().trim().max(50).optional(),
  color: z.string().trim().max(100).optional(),
  bordado: z.boolean().optional(),
});

export const crearPedidoManualSchema = z.object({
  clienteId: z.number().int().positive().optional(),
  clienteNombre: z.string().trim().min(1).max(255),
  clienteEmail: z.string().trim().email().max(255),
  clienteTelefono: z.string().trim().max(50).optional(),
  clienteDireccion: z.string().trim().max(5000).optional(),
  formaPago: z.enum(['efectivo', 'transferencia']).default('transferencia'),
  refCliente: z.string().trim().max(100).optional(),
  numOrdenCompra: z.string().trim().max(100).optional(),
  entregaCp: z.string().trim().max(20).optional(),
  entregaNotas: z.string().trim().max(2000).optional(),
  observaciones: z.string().trim().max(5000).optional(),
  items: z.array(pedidoManualItemSchema).min(1).max(500),
});

export const editarPedidoSchema = z.object({
  clienteNombre: z.string().trim().min(1).max(255).optional(),
  clienteEmail: z.string().trim().email().max(255).optional(),
  clienteTelefono: z.string().trim().max(50).nullable().optional(),
  clienteDireccion: z.string().trim().max(5000).nullable().optional(),
  refCliente: z.string().trim().max(100).nullable().optional(),
  numOrdenCompra: z.string().trim().max(100).nullable().optional(),
  entregaCp: z.string().trim().max(20).nullable().optional(),
  entregaNotas: z.string().trim().max(2000).nullable().optional(),
  observaciones: z.string().trim().max(5000).nullable().optional(),
});

export const resolverFallidoSchema = z.object({
  accion: z.enum(['reintentar', 'cancelar']).default('reintentar'),
  motivo: z.string().trim().max(2000).optional(),
});

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function stableHashPedidoPayload(value: unknown): string {
  return stableHash(value);
}

function parseRemoteId(response: unknown): number | null {
  if (!response || typeof response !== 'object') return null;
  const o = response as Record<string, unknown>;
  const n = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
    return null;
  };
  const direct = n(o.id) ?? n(o.orden_id) ?? n(o.order_id);
  if (direct != null) return direct;
  const data = o.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    return n(d.id) ?? n(d.orden_id) ?? n(d.order_id);
  }
  return null;
}

/**
 * Mapea códigos PE de SFactory (Orden Pedido) a `OrderStatus` para emails/sync.
 * Referencia tenant: 1 Cotización, 2 Aprobado, 3 Terminado, 4 Cancelado, 5 En curso, 6 A entregar.
 */
export function mapRemoteOrderStatus(estado: string | null): OrderStatus | null {
  if (!estado) return null;
  const e = estado.toLowerCase().trim();
  if (e === '1') return OrderStatus.PENDING;
  if (e === '2') return OrderStatus.CONFIRMED;
  if (e === '3') return OrderStatus.DELIVERED;
  if (e === '4') return OrderStatus.CANCELLED;
  if (e === '5') return OrderStatus.IN_PROCESS;
  if (e === '6') return OrderStatus.SHIPPED;
  if (e === '11') return OrderStatus.DELIVERED;
  if (e === '12') return OrderStatus.CANCELLED;
  if (e.includes('cancel') || e.includes('anulad')) return OrderStatus.CANCELLED;
  if (e.includes('terminad') || e.includes('cerrad')) return OrderStatus.DELIVERED;
  if (e.includes('entreg')) return OrderStatus.DELIVERED;
  if (e.includes('despach') || e.includes('env')) return OrderStatus.SHIPPED;
  if (e.includes('proces') || e.includes('prepar') || e.includes('curso')) return OrderStatus.IN_PROCESS;
  if (e.includes('confirm') || e.includes('aprob')) return OrderStatus.CONFIRMED;
  if (e.includes('cotiz') || e.includes('pend')) return OrderStatus.PENDING;
  return null;
}

function pedidoNotificationPayload(pedido: {
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

async function crearLogSfactory(
  pedidoId: number,
  accion: PedidoSfactoryAccion,
  payload: unknown,
  exitoso: boolean,
  response?: unknown,
  error?: string | null
): Promise<void> {
  await prisma.pedidoSfactoryLog.create({
    data: {
      pedidoId,
      accion,
      payload: asJson(payload),
      response: response !== undefined ? asJson(response) : undefined,
      exitoso,
      error: error ?? undefined,
    },
  });
}

async function devolverStockSiReservado(
  tx: Prisma.TransactionClient,
  pedidoId: number
): Promise<void> {
  const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido?.stockReservadoWeb) return;

  const items = await tx.pedidoItem.findMany({ where: { pedidoId } });
  for (const item of items) {
    if (item.productoWebId == null) continue;
    await tx.productoWeb.update({
      where: { id: item.productoWebId },
      data: { stockCache: { increment: item.cantidad } },
    });
  }
  await tx.pedido.update({
    where: { id: pedidoId },
    data: { stockReservadoWeb: false },
  });
}

export class PedidoSyncService {
  async listar(empresaId: number, query: z.infer<typeof pedidoListQuerySchema>) {
    const where: Prisma.PedidoWhereInput = { empresaId };
    if (query.estado) where.estadoInterno = query.estado;
    if (query.syncStatus) where.syncStatus = query.syncStatus;
    if (query.desde || query.hasta) {
      where.fechaPedido = {
        ...(query.desde ? { gte: new Date(`${query.desde}T00:00:00.000Z`) } : {}),
        ...(query.hasta ? { lte: new Date(`${query.hasta}T23:59:59.999Z`) } : {}),
      };
    }
    if (query.search) {
      const s = query.search;
      const id = /^\d+$/.test(s) ? parseInt(s, 10) : null;
      where.OR = [
        ...(id != null ? [{ id }, { sfactoryOrdenId: id }] : []),
        { clienteNombre: { contains: s } },
        { clienteEmail: { contains: s } },
        { sfactoryExternalOrderId: { contains: s } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [total, data] = await prisma.$transaction([
      prisma.pedido.count({ where }),
      prisma.pedido.findMany({
        where,
        orderBy: { fechaPedido: 'desc' },
        skip,
        take: query.limit,
        include: {
          items: true,
          cliente: { select: { id: true, razonSocial: true, sfactoryId: true } },
        },
      }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async detalle(empresaId: number, pedidoId: number) {
    return prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
      include: {
        items: true,
        cliente: true,
        empresa: { select: { id: true, nombre: true, sfactoryCompanyKey: true } },
        sfactoryLogs: { orderBy: { creadoAt: 'desc' }, take: 50 },
        envioLogs: { orderBy: { creadoAt: 'desc' }, take: 20 },
      },
    });
  }

  async crearManual(empresaId: number, input: z.infer<typeof crearPedidoManualSchema>) {
    let subtotal = new Prisma.Decimal(0);
    const items = input.items.map((item) => {
      const cantidad = new Prisma.Decimal(item.cantidad);
      const precioUnitario = new Prisma.Decimal(item.precioUnitario);
      const lineSubtotal = cantidad.mul(precioUnitario);
      subtotal = subtotal.add(lineSubtotal);
      return { item, cantidad, precioUnitario, subtotal: lineSubtotal };
    });

    const pedido = await prisma.pedido.create({
      data: {
        empresaId,
        clienteId: input.clienteId,
        estadoInterno: EstadoPedido.pendiente_confirmacion,
        syncStatus: PedidoSyncStatus.pending,
        clienteNombre: input.clienteNombre,
        clienteEmail: input.clienteEmail,
        clienteTelefono: input.clienteTelefono ?? null,
        clienteDireccion: input.clienteDireccion ?? null,
        refCliente: input.refCliente ?? null,
        numOrdenCompra: input.numOrdenCompra ?? null,
        entregaCp: input.entregaCp ?? null,
        entregaNotas: input.entregaNotas ?? null,
        subtotal,
        descuento: new Prisma.Decimal(0),
        iva: new Prisma.Decimal(0),
        total: subtotal,
        formaPago: input.formaPago as FormaPago,
        observaciones: input.observaciones ?? null,
        expiresAt: computeExpiresAtPedidoManual(),
        items: {
          create: items.map(({ item, cantidad, precioUnitario, subtotal: lineSubtotal }) => ({
            productoWebId: item.productoWebId,
            productoPadreId: item.productoPadreId,
            sfactoryItemId: item.sfactoryItemId,
            nombre: item.nombre,
            codigo: item.codigo,
            cantidad,
            precioUnitario,
            descuento: new Prisma.Decimal(0),
            subtotal: lineSubtotal,
            talle: item.talle ?? null,
            color: item.color ?? null,
            bordado: item.bordado ?? false,
          })),
        },
      },
      include: { items: true, cliente: true },
    });

    await adminNotificationService.notifyPedido({
      empresaId,
      type: 'pedido.confirmation_required',
      pedidoId: pedido.id,
      severity: AdminNotificationSeverity.warning,
      title: `Pedido #${pedido.id} pendiente de confirmación`,
      message: `${pedido.clienteNombre} cargó un pedido manual por ${pedido.total.toFixed(2)}.`,
      payload: pedidoNotificationPayload(pedido),
    });

    return pedido;
  }

  async editarBorrador(
    empresaId: number,
    pedidoId: number,
    input: z.infer<typeof editarPedidoSchema>
  ) {
    const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, empresaId } });
    if (!pedido) throw new Error('Pedido no encontrado');
    const editables: EstadoPedido[] = [
      EstadoPedido.carrito,
      EstadoPedido.pendiente_pago,
      EstadoPedido.pendiente_confirmacion,
      EstadoPedido.fallido,
    ];
    if (!editables.includes(pedido.estadoInterno)) {
      throw new Error('Los pedidos confirmados se editan desde SFactory y luego se sincronizan.');
    }

    return prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        ...input,
        syncStatus: PedidoSyncStatus.pending,
        syncError: null,
      },
      include: { items: true, cliente: true },
    });
  }

  async confirmar(empresaId: number, pedidoId: number) {
    const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, empresaId } });
    if (!pedido) throw new Error('Pedido no encontrado');

    if (pedido.estadoInterno === EstadoPedido.pendiente_pago) {
      if (pedido.formaPago === FormaPago.mercado_pago) {
        throw new Error(
          'Falta el pago de Mercado Pago. El pedido se confirmará automáticamente cuando el cliente complete el pago.'
        );
      }
      throw new Error(
        'El pedido está pendiente de pago y no puede confirmarse manualmente desde el admin.'
      );
    }

    if (puedeReintentarAprobacionErp(pedido)) {
      return procesarPedidoConfirmado(pedidoId);
    }

    if (pedido.estadoInterno !== EstadoPedido.pendiente_confirmacion) {
      throw new Error(
        `Solo se pueden confirmar pedidos en pendiente de confirmación (estado actual: ${pedido.estadoInterno}).`
      );
    }

    return procesarPedidoConfirmado(pedidoId);
  }

  async cancelar(empresaId: number, pedidoId: number, motivo?: string): Promise<unknown> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
      include: { empresa: true },
    });
    if (!pedido) throw new Error('Pedido no encontrado');

    if (pedido.sfactoryOrdenId != null || pedido.estadoInterno === EstadoPedido.confirmado) {
      return this.cancelarEnSfactory(empresaId, pedidoId, motivo);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await devolverStockSiReservado(tx, pedidoId);
      const updated = await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.cancelado,
          syncStatus: PedidoSyncStatus.synced,
          syncError: null,
          observaciones: motivo
            ? `${pedido.observaciones ?? ''}\n[Cancelación admin] ${motivo}`.trim()
            : pedido.observaciones,
        },
        include: { items: true, cliente: true },
      });
      return updated;
    });
    await this.notifyCancelled(empresaId, updated, pedido.estadoInterno);
    sendPedidoStatusEmailAsync(pedidoId, OrderStatus.CANCELLED, {
      notes: updated.observaciones ?? undefined,
    });
    syncStockPedidoItemsAsync(pedidoId);
    return updated;
  }

  private async notifyCancelled(empresaId: number, pedido: {
    id: number;
    estadoInterno: EstadoPedido;
    syncStatus?: PedidoSyncStatus;
    sfactoryOrdenId?: number | null;
    total?: Prisma.Decimal | string | number;
    clienteNombre?: string;
  }, estadoAnterior?: EstadoPedido) {
    await adminNotificationService.notifyPedido({
      empresaId,
      type: 'pedido.cancelled',
      pedidoId: pedido.id,
      severity: AdminNotificationSeverity.warning,
      title: `Pedido #${pedido.id} cancelado`,
      message: `El pedido de ${pedido.clienteNombre ?? 'cliente'} fue cancelado.`,
      payload: pedidoNotificationPayload(pedido, { estadoAnterior }),
    });
  }

  async cancelarEnSfactory(empresaId: number, pedidoId: number, motivo?: string): Promise<unknown> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
      include: { empresa: true },
    });
    if (!pedido) throw new Error('Pedido no encontrado');
    if (pedido.sfactoryOrdenId == null) {
      return this.cancelar(empresaId, pedidoId, motivo);
    }

    const readPayload = { orderId: pedido.sfactoryOrdenId };
    let editPayload: unknown = null;

    try {
      const result = await cancelarOrdenPedidoEnSfactory(
        pedido.sfactoryOrdenId,
        pedido.empresa.sfactoryCompanyKey,
        motivo
      );
      await crearLogSfactory(pedidoId, PedidoSfactoryAccion.leer, readPayload, true, result.remote, null);
      editPayload = result.editPayload ?? { skippedEdit: true, estado: SFACTORY_PE_ESTADO.cancelado };
      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.editar,
        editPayload,
        true,
        result.response,
        null
      );
      const response = result.response;

      await prisma.$transaction(async (tx) => {
        await devolverStockSiReservado(tx, pedidoId);
        await tx.pedido.update({
          where: { id: pedidoId },
          data: {
            estadoInterno: EstadoPedido.cancelado,
            estadoErp: OrderStatus.CANCELLED,
            sfactoryEstado: SFACTORY_PE_ESTADO.cancelado,
            syncStatus: PedidoSyncStatus.synced,
            syncError: null,
            sfactorySyncedAt: new Date(),
            sfactorySnapshot: asJson(response),
            observaciones: motivo
              ? `${pedido.observaciones ?? ''}\n[Cancelación admin] ${motivo}`.trim()
              : pedido.observaciones,
          },
        });
      });

      const updated = await this.detalle(empresaId, pedidoId);
      if (updated) {
        await this.notifyCancelled(empresaId, updated, pedido.estadoInterno);
        sendPedidoStatusEmailAsync(pedidoId, OrderStatus.CANCELLED, {
          notes: updated.observaciones ?? undefined,
        });
      }
      syncStockPedidoItemsAsync(pedidoId);
      return updated;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await crearLogSfactory(pedidoId, PedidoSfactoryAccion.editar, editPayload, false, undefined, msg);
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: { syncStatus: PedidoSyncStatus.error, syncError: msg },
      });
      await adminNotificationService.notifyPedido({
        empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Error sincronizando pedido #${pedidoId}`,
        message: msg,
        payload: pedidoNotificationPayload(pedido, { error: msg }),
      });
      throw e;
    }
  }

  async reintentarSfactory(empresaId: number, pedidoId: number) {
    const before = await prisma.pedido.findFirst({ where: { id: pedidoId, empresaId } });
    if (!before) throw new Error('Pedido no encontrado');

    if (puedeReintentarAprobacionErp(before)) {
      const result = await procesarPedidoConfirmado(pedidoId);
      const pedido = await this.detalle(empresaId, pedidoId);
      return {
        alreadySynced: false,
        reintentoAprobacionErp: true,
        result,
        pedido,
      };
    }

    if (before.sfactoryOrdenId != null) {
      return { alreadySynced: true, pedido: before };
    }
    await reintentarFallidosSfactory();
    const pedido = await this.detalle(empresaId, pedidoId);
    if (pedido?.sfactoryOrdenId != null) {
      await adminNotificationService.notifyPedido({
        empresaId,
        type: 'pedido.sync_recovered',
        pedidoId,
        severity: AdminNotificationSeverity.success,
        title: `Pedido #${pedidoId} recuperado`,
        message: 'El pedido fallido se sincronizó correctamente con SFactory.',
        payload: pedidoNotificationPayload(pedido, {
          estadoAnterior: before.estadoInterno,
          estadoNuevo: pedido.estadoInterno,
        }),
      });
    }
    return { alreadySynced: false, pedido };
  }

  async resolverFallido(
    empresaId: number,
    pedidoId: number,
    input: z.infer<typeof resolverFallidoSchema>
  ) {
    const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, empresaId } });
    if (!pedido) throw new Error('Pedido no encontrado');
    if (pedido.estadoInterno !== EstadoPedido.fallido) {
      throw new Error(`El pedido no está fallido (estado: ${pedido.estadoInterno})`);
    }
    if (input.accion === 'cancelar') {
      return this.cancelar(empresaId, pedidoId, input.motivo);
    }
    return this.reintentarSfactory(empresaId, pedidoId);
  }

  async syncDesdeSfactory(empresaId: number, pedidoId: number) {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
      include: { empresa: true },
    });
    if (!pedido) throw new Error('Pedido no encontrado');
    if (pedido.sfactoryOrdenId == null) {
      throw new Error('El pedido no tiene sfactoryOrdenId; todavía no existe en SFactory.');
    }

    const payload = { orderId: pedido.sfactoryOrdenId };
    try {
      const response = await sfactoryService.leerOrdenPedido(
        pedido.sfactoryOrdenId,
        pedido.empresa.sfactoryCompanyKey
      );
      const remoteId = parseRemoteId(response) ?? pedido.sfactoryOrdenId;
      const remoteEstado = parseEstadoFromOrdenResponse(response);
      const estadoErp = mapRemoteOrderStatus(remoteEstado);
      const hash = stableHashPedidoPayload(response);
      const now = new Date();

      if (pedido.sfactoryLastPayloadHash === hash) {
        await prisma.pedido.update({
          where: { id: pedidoId },
          data: { sfactoryLastReadAt: now },
        });
        return this.detalle(empresaId, pedidoId);
      }

      await crearLogSfactory(
        pedidoId,
        PedidoSfactoryAccion.leer,
        payload,
        true,
        response,
        null
      );

      const data: Prisma.PedidoUpdateInput = {
        sfactoryOrdenId: remoteId,
        sfactoryEstado: remoteEstado ?? undefined,
        estadoErp: estadoErp ?? undefined,
        syncStatus: PedidoSyncStatus.synced,
        syncError: null,
        sfactorySyncedAt: now,
        sfactoryLastReadAt: now,
        sfactoryLastPayloadHash: hash,
        sfactorySnapshot: asJson(response),
      };

      if (estadoErp === OrderStatus.CANCELLED) {
        data.estadoInterno = EstadoPedido.cancelado;
      } else if (estadoErp === OrderStatus.DELIVERED) {
        data.estadoInterno = EstadoPedido.entregado;
      } else if (estadoErp === OrderStatus.SHIPPED) {
        data.estadoInterno = EstadoPedido.despachado;
      } else if (estadoErp === OrderStatus.IN_PROCESS && pedido.estadoInterno === EstadoPedido.confirmado) {
        data.estadoInterno = EstadoPedido.procesando;
      }

      if (estadoErp === OrderStatus.CANCELLED && pedido.stockReservadoWeb) {
        await prisma.$transaction(async (tx) => {
          await devolverStockSiReservado(tx, pedidoId);
          await tx.pedido.update({ where: { id: pedidoId }, data });
        });
      } else {
        await prisma.pedido.update({ where: { id: pedidoId }, data });
      }

      const updated = await this.detalle(empresaId, pedidoId);
      if (updated && (updated.estadoInterno !== pedido.estadoInterno || pedido.syncStatus !== PedidoSyncStatus.synced)) {
        await adminNotificationService.notifyPedido({
          empresaId,
          type: updated.estadoInterno === EstadoPedido.cancelado ? 'pedido.cancelled' : 'pedido.status_changed',
          pedidoId,
          severity: updated.estadoInterno === EstadoPedido.cancelado ? AdminNotificationSeverity.warning : AdminNotificationSeverity.info,
          title: `Pedido #${pedidoId} actualizado desde SFactory`,
          message: `Estado: ${pedido.estadoInterno} → ${updated.estadoInterno}.`,
          payload: pedidoNotificationPayload(updated, {
            estadoAnterior: pedido.estadoInterno,
            estadoNuevo: updated.estadoInterno,
          }),
        });
      }
      return updated;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          syncStatus: PedidoSyncStatus.error,
          syncError: msg,
          sfactoryLastReadAt: new Date(),
        },
      });
      await crearLogSfactory(pedidoId, PedidoSfactoryAccion.leer, payload, false, undefined, msg);
      await adminNotificationService.notifyPedido({
        empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Error leyendo pedido #${pedidoId} en SFactory`,
        message: msg,
        payload: pedidoNotificationPayload(pedido, { error: msg }),
      });
      throw e;
    }
  }

  async syncPedidosActivosDesdeSfactory(empresaId: number, limit = 50) {
    const pedidos = await prisma.pedido.findMany({
      where: {
        empresaId,
        sfactoryOrdenId: { not: null },
        estadoInterno: {
          in: [
            EstadoPedido.confirmado,
            EstadoPedido.procesando,
            EstadoPedido.despachado,
            EstadoPedido.fallido,
          ],
        },
      },
      orderBy: [{ sfactoryLastReadAt: 'asc' }, { fechaPedido: 'desc' }],
      take: limit,
      select: { id: true },
    });

    let sincronizados = 0;
    let omitidos = 0;
    const errores: Array<{ pedidoId: number; error: string }> = [];
    for (const pedido of pedidos) {
      try {
        const before = await prisma.pedido.findFirst({
          where: { id: pedido.id },
          select: { sfactoryLastPayloadHash: true, sfactoryLastReadAt: true },
        });
        await this.syncDesdeSfactory(empresaId, pedido.id);
        const after = await prisma.pedido.findFirst({
          where: { id: pedido.id },
          select: { sfactoryLastPayloadHash: true, sfactoryLastReadAt: true },
        });
        if (
          before?.sfactoryLastPayloadHash === after?.sfactoryLastPayloadHash &&
          before?.sfactoryLastReadAt !== after?.sfactoryLastReadAt
        ) {
          omitidos++;
        } else {
          sincronizados++;
        }
      } catch (e: unknown) {
        errores.push({
          pedidoId: pedido.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { consultados: pedidos.length, sincronizados, omitidos, errores };
  }

  async syncStockDesdeSfactory(empresaId: number, warehouseId?: number) {
    const result = await stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce(empresaId, warehouseId);
    const maxStock = Number(process.env.DASHBOARD_STOCK_CRITICO_MAX ?? 5);
    const critical = await prisma.productoWeb.findMany({
      where: {
        empresaId,
        activoSfactory: true,
        stockCache: { not: null, lte: new Prisma.Decimal(Number.isFinite(maxStock) ? maxStock : 5) },
      },
      orderBy: [{ stockCache: 'asc' }, { nombre: 'asc' }],
      take: 10,
      select: { id: true, nombre: true, sfactoryCodigo: true, stockCache: true },
    });
    if (critical.length > 0) {
      await adminNotificationService.createAndEmit({
        empresaId,
        type: 'stock.critical',
        severity: AdminNotificationSeverity.warning,
        title: `${critical.length} producto(s) con stock crítico`,
        message: `Hay productos con stock menor o igual a ${Number.isFinite(maxStock) ? maxStock : 5}.`,
        entityType: 'stock',
        entityId: `critical-${new Date().toISOString().slice(0, 10)}`,
        payload: { maxStock, items: critical },
      });
    }
    return result;
  }
}

export const pedidoSyncService = new PedidoSyncService();
