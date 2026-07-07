import prisma from '../../lib/prisma';
import { stockPreciosSyncService } from './stock-precios-sync.service';

export function isPedidoPostSyncStockEnabled(): boolean {
  return process.env.PEDIDO_POST_SYNC_STOCK_ENABLED !== 'false';
}

/**
 * Reserva stock local en procesarPedidoConfirmado solo si aún no se reservó al confirmar checkout.
 */
export function debeReservarStockLocal(input: {
  esReintentoAprobacionErp: boolean;
  stockReservadoWeb: boolean;
}): boolean {
  if (input.esReintentoAprobacionErp) return false;
  return !input.stockReservadoWeb;
}

/**
 * Sincroniza stock/precio de los ítems del pedido desde S-Factory (fire-and-forget).
 */
export function syncStockPedidoItemsAsync(pedidoId: number): void {
  if (!isPedidoPostSyncStockEnabled()) return;

  void (async () => {
    try {
      const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        select: {
          empresaId: true,
          items: { select: { codigo: true } },
        },
      });
      if (!pedido) return;

      const codigos = [
        ...new Set(pedido.items.map((i) => i.codigo.trim()).filter(Boolean)),
      ];
      if (codigos.length === 0) return;

      const result = await stockPreciosSyncService.syncStockPreciosPorCodigos(
        pedido.empresaId,
        codigos
      );
      console.log(
        `[pedido-stock-sync] pedido ${pedidoId}: ${result.variantesActualizadas} variantes actualizadas (${codigos.length} códigos)`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[pedido-stock-sync] sync post-pedido falló pedido ${pedidoId}:`, msg);
    }
  })();
}
