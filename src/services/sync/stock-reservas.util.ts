import { EstadoPedido, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const ESTADOS_RESERVA_ACTIVA: EstadoPedido[] = [
  EstadoPedido.pendiente_pago,
  EstadoPedido.pendiente_confirmacion,
  EstadoPedido.procesando,
  EstadoPedido.fallido,
];

/**
 * Cantidad reservada en web por productoWebId (pedidos con stockReservadoWeb).
 */
export async function getReservasActivasPorProductoWebId(
  empresaId: number,
  productoWebIds?: number[]
): Promise<Map<number, Prisma.Decimal>> {
  const items = await prisma.pedidoItem.findMany({
    where: {
      productoWebId: productoWebIds?.length ? { in: productoWebIds } : { not: null },
      pedido: {
        empresaId,
        stockReservadoWeb: true,
        estadoInterno: { in: ESTADOS_RESERVA_ACTIVA },
      },
    },
    select: {
      productoWebId: true,
      cantidad: true,
    },
  });

  const map = new Map<number, Prisma.Decimal>();
  for (const line of items) {
    if (line.productoWebId == null) continue;
    const prev = map.get(line.productoWebId) ?? new Prisma.Decimal(0);
    map.set(line.productoWebId, prev.add(line.cantidad));
  }
  return map;
}

/** Stock SF a persistir en cache: físico menos reservas web activas. */
export function computeStockCacheConReservas(
  stockFisicoSf: number,
  reservadoWeb: Prisma.Decimal | number | null | undefined
): number {
  const fisico = Number.isFinite(stockFisicoSf) ? stockFisicoSf : 0;
  const reservado = Number(reservadoWeb ?? 0);
  return Math.max(0, Number((fisico - reservado).toFixed(2)));
}
