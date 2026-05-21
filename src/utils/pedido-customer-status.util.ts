import { EstadoPedido, OrderStatus } from '@prisma/client';

/** Estado visible en perfil / emails al cliente (ecommerce). */
export type CustomerOrderStatus =
  | 'pendiente_pago'
  | 'pendiente_confirmacion'
  | 'confirmado'
  | 'en_preparacion'
  | 'enviado'
  | 'entregado'
  | 'cancelado'
  | 'fallido'
  | 'vencido';

const CUSTOMER_LABELS: Record<CustomerOrderStatus, string> = {
  pendiente_pago: 'Pendiente de pago',
  pendiente_confirmacion: 'Pendiente de confirmación',
  confirmado: 'Confirmado',
  en_preparacion: 'En preparación',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  fallido: 'Pago fallido',
  vencido: 'Vencido',
};

function fromErp(estadoErp: OrderStatus): CustomerOrderStatus {
  switch (estadoErp) {
    case OrderStatus.PENDING:
      return 'pendiente_confirmacion';
    case OrderStatus.CONFIRMED:
      return 'confirmado';
    case OrderStatus.IN_PROCESS:
      return 'en_preparacion';
    case OrderStatus.SHIPPED:
      return 'enviado';
    case OrderStatus.DELIVERED:
      return 'entregado';
    case OrderStatus.CANCELLED:
      return 'cancelado';
    default:
      return 'pendiente_confirmacion';
  }
}

function fromInterno(estadoInterno: EstadoPedido): CustomerOrderStatus {
  switch (estadoInterno) {
    case EstadoPedido.pendiente_pago:
      return 'pendiente_pago';
    case EstadoPedido.pendiente_confirmacion:
      return 'pendiente_confirmacion';
    case EstadoPedido.procesando:
      return 'en_preparacion';
    case EstadoPedido.confirmado:
      return 'confirmado';
    case EstadoPedido.despachado:
      return 'enviado';
    case EstadoPedido.entregado:
      return 'entregado';
    case EstadoPedido.cancelado:
      return 'cancelado';
    case EstadoPedido.fallido:
      return 'fallido';
    case EstadoPedido.vencido:
      return 'vencido';
    case EstadoPedido.carrito:
      return 'pendiente_confirmacion';
    default:
      return 'pendiente_confirmacion';
  }
}

export function resolveCustomerOrderStatus(pedido: {
  estadoErp: OrderStatus | null;
  estadoInterno: EstadoPedido;
}): CustomerOrderStatus {
  if (pedido.estadoErp) {
    return fromErp(pedido.estadoErp);
  }
  return fromInterno(pedido.estadoInterno);
}

export function getCustomerOrderStatusLabel(status: CustomerOrderStatus): string {
  return CUSTOMER_LABELS[status] ?? status;
}
