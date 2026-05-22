import { EstadoPedido } from '@prisma/client';
import { isRetiroEnTienda, type PedidoEntregaInput } from '../utils/pedido-entrega.util';

export const PICKUP_ACTIVE_STATES: EstadoPedido[] = [
  EstadoPedido.confirmado,
  EstadoPedido.procesando,
  EstadoPedido.despachado,
];

export type PedidoPickupInput = PedidoEntregaInput & { estadoInterno: EstadoPedido };

export function assertPedidoRetiroTienda(pedido: PedidoEntregaInput): void {
  if (!isRetiroEnTienda(pedido)) {
    throw new Error('Este pedido no es retiro en tienda');
  }
}

export function assertPedidoNotTerminalPickup(pedido: { estadoInterno: EstadoPedido }): void {
  if (pedido.estadoInterno === EstadoPedido.cancelado || pedido.estadoInterno === EstadoPedido.vencido) {
    throw new Error('El pedido está cancelado o vencido');
  }
  if (pedido.estadoInterno === EstadoPedido.entregado) {
    throw new Error('El pedido ya fue entregado');
  }
}

/** Valida que admin puede enviar mail "listo para retirar". */
export function validateEnviarListoParaRetiro(pedido: PedidoPickupInput): void {
  assertPedidoRetiroTienda(pedido);
  assertPedidoNotTerminalPickup(pedido);
  if (!PICKUP_ACTIVE_STATES.includes(pedido.estadoInterno)) {
    throw new Error('El pedido aún no está confirmado');
  }
}

/**
 * Valida marcar retirado. Retorna `alreadyDelivered` si ya estaba entregado (idempotente).
 */
export function validateMarcarPedidoRetirado(
  pedido: PedidoPickupInput
): { alreadyDelivered: true } | { alreadyDelivered: false } {
  assertPedidoRetiroTienda(pedido);
  if (pedido.estadoInterno === EstadoPedido.entregado) {
    return { alreadyDelivered: true };
  }
  assertPedidoNotTerminalPickup(pedido);
  if (!PICKUP_ACTIVE_STATES.includes(pedido.estadoInterno)) {
    throw new Error('El pedido no puede marcarse como retirado en este estado');
  }
  return { alreadyDelivered: false };
}
