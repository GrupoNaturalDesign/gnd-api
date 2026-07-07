import {
  AdminNotificationSeverity,
  EstadoPedido,
  FormaPago,
  PedidoSyncStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../lib/prisma';
import type { MpPricingMode } from '../utils/checkout-mp-pricing.util';
import {
  expectedUnitPriceForMpMode,
  unitPriceMatchesMpMode,
} from '../utils/checkout-mp-pricing.util';
import { adminNotificationService } from './admin-notification.service';

export type CheckoutPriceMode = 'lista' | 'transfer';

export interface CheckoutItemPriceInput {
  productoWebId: number;
  codigo: string;
  precioUnitario: number;
}

/** Espejo server de client/src/app/utils/checkoutPricing.ts */
export function resolveCheckoutPriceMode(
  formaPago: FormaPago | null | undefined,
  mpPricingMode?: MpPricingMode | null
): CheckoutPriceMode {
  if (formaPago === FormaPago.mercado_pago) {
    return mpPricingMode === 'transfer' ? 'transfer' : 'lista';
  }
  return 'transfer';
}

function mpModeFromCheckoutPriceMode(mode: CheckoutPriceMode): MpPricingMode {
  return mode === 'lista' ? 'financiado' : 'transfer';
}

export async function validateItemPricesForCheckout(
  items: CheckoutItemPriceInput[],
  mode: CheckoutPriceMode
): Promise<void> {
  const mpMode = mpModeFromCheckoutPriceMode(mode);
  const ids = [...new Set(items.map((i) => i.productoWebId))];
  const rows = await prisma.productoPrecio.findMany({
    where: {
      productoWebId: { in: ids },
      tipoCliente: 'minorista',
    },
  });
  const byWebId = new Map(rows.map((r) => [r.productoWebId, r]));

  for (const item of items) {
    const row = byWebId.get(item.productoWebId);
    if (!row) {
      throw new Error(`Precio no encontrado para productoWebId ${item.productoWebId}.`);
    }
    const lista = Number(row.precioLista);
    const transfer = row.precioTransfer != null ? Number(row.precioTransfer) : null;
    if (!unitPriceMatchesMpMode(item.precioUnitario, lista, transfer, mpMode)) {
      throw new Error(
        `Precio unitario inválido para ${item.codigo} (modo ${mode}).`
      );
    }
  }
}

export interface ReservarStockResult {
  ok: boolean;
  pedidoId: number;
  message?: string;
  alreadyReserved?: boolean;
}

function pedidoNotificationPayload(
  pedido: {
    id: number;
    estadoInterno?: EstadoPedido;
    syncStatus?: PedidoSyncStatus;
    sfactoryOrdenId?: number | null;
    total?: Prisma.Decimal | string | number;
    clienteNombre?: string;
  },
  extra: Record<string, unknown> = {}
) {
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

/**
 * Reserva stock web al confirmar pedido. Idempotente si stockReservadoWeb ya es true.
 */
export async function reservarStockPedidoWeb(
  pedidoId: number,
  options?: {
    empresaId?: number;
    marcarProcesando?: boolean;
  }
): Promise<ReservarStockResult> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedido) {
    throw new Error(`Pedido ${pedidoId} no encontrado`);
  }

  if (pedido.stockReservadoWeb) {
    return { ok: true, pedidoId, alreadyReserved: true };
  }

  for (const line of pedido.items) {
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
      const empresaId = options?.empresaId ?? pedido.empresaId;
      await adminNotificationService.notifyPedido({
        empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.error,
        title: `Pedido #${pedidoId} sin stock suficiente`,
        message: msg,
        payload: pedidoNotificationPayload(pedido, {
          estadoAnterior: pedido.estadoInterno,
          estadoNuevo: EstadoPedido.fallido,
          syncStatus: PedidoSyncStatus.error,
        }),
      });
      return { ok: false, pedidoId, message: msg };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          ...(options?.marcarProcesando
            ? { estadoInterno: EstadoPedido.procesando }
            : {}),
          stockReservadoWeb: true,
          syncStatus: PedidoSyncStatus.pending,
          syncError: null,
          sfactoryExternalOrderId: pedido.sfactoryExternalOrderId ?? `WEB-${pedidoId}`,
        },
      });

      const lines = await tx.pedidoItem.findMany({ where: { pedidoId } });
      for (const line of lines) {
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
    return { ok: true, pedidoId };
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
    const empresaId = options?.empresaId ?? pedido.empresaId;
    await adminNotificationService.notifyPedido({
      empresaId,
      type: 'pedido.sync_failed',
      pedidoId,
      severity: AdminNotificationSeverity.error,
      title: `Pedido #${pedidoId} no pudo reservar stock`,
      message: errMsg,
      payload: pedidoNotificationPayload(pedido, {
        estadoAnterior: pedido.estadoInterno,
        estadoNuevo: EstadoPedido.fallido,
        syncStatus: PedidoSyncStatus.error,
      }),
    });
    return { ok: false, pedidoId, message: errMsg };
  }
}

/** Total productos a cobrar (subtotal − descuento cupón). */
export function computeCheckoutProductosACobrar(
  subtotal: Prisma.Decimal | number,
  descuento: Prisma.Decimal | number
): number {
  const s = new Prisma.Decimal(subtotal);
  const d = new Prisma.Decimal(descuento);
  return Number(s.sub(d).toFixed(2));
}

/** Total checkout (productos netos + envío). */
export function computeCheckoutTotalACobrar(
  subtotal: Prisma.Decimal | number,
  descuento: Prisma.Decimal | number,
  costoEnvio: Prisma.Decimal | number
): number {
  const productos = computeCheckoutProductosACobrar(subtotal, descuento);
  const envio = Number(new Prisma.Decimal(costoEnvio).toFixed(2));
  return Number((productos + envio).toFixed(2));
}
