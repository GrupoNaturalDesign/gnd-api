import type { OrderStatus } from '@prisma/client';

/** Textos e íconos solo para presentación en `OrderStatusEmail`. */
export interface OrderStatusUi {
  icon: string;
  title: string;
  lead: string;
  bannerBg: string;
}

const UI: Record<OrderStatus, OrderStatusUi> = {
  PENDING: {
    icon: '⏳',
    title: 'Pedido recibido',
    lead: 'Recibimos tu pedido y lo estamos procesando.',
    bannerBg: '#ED3237',
  },
  CONFIRMED: {
    icon: '✓',
    title: 'Pedido confirmado',
    lead: 'Tu pedido fue confirmado. Pronto te informamos el siguiente paso.',
    bannerBg: '#000000',
  },
  IN_PROCESS: {
    icon: '⚙',
    title: 'En proceso',
    lead: 'Tu pedido está en preparación.',
    bannerBg: '#ED3237',
  },
  SHIPPED: {
    icon: '🚚',
    title: 'Enviado',
    lead: 'Tu pedido salió a entrega. Podés consultar el seguimiento si aplica.',
    bannerBg: '#000000',
  },
  DELIVERED: {
    icon: '📦',
    title: 'Entregado',
    lead: 'Tu pedido fue entregado. ¡Gracias por elegirnos!',
    bannerBg: '#1B5E20',
  },
  CANCELLED: {
    icon: '✕',
    title: 'Pedido cancelado',
    lead: 'Tu pedido fue cancelado. Si tenés dudas, escribinos.',
    bannerBg: '#424242',
  },
};

export function getOrderStatusUi(status: OrderStatus): OrderStatusUi {
  return UI[status];
}

export function getOrderStatusEmailSubject(status: OrderStatus, orderRef: string): string {
  const short = UI[status]?.title ?? 'Actualización de pedido';
  return `GND — ${short}${orderRef ? ` · ${orderRef}` : ''}`;
}
