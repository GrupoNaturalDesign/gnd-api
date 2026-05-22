import type { OrderStatus } from '@prisma/client';

/** Resultado estándar de envío (Resend + log). */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Tipos persistidos en `EmailLog.type`. */
export type EmailLogType =
  | 'welcome'
  | 'order_status'
  | 'contact'
  | 'newsletter'
  | 'internal'
  | 'payment_instructions';

export type EmailLogStatus = 'sent' | 'failed';

export interface WelcomeUserPayload {
  name: string;
  email: string;
}

export interface OrderLineEmailItem {
  nombre: string;
  cantidad: number;
  subtotalFormatted: string;
  precioUnitarioFormatted?: string;
  especificaciones?: string;
  bordado?: boolean;
}

/**
 * Payload para emails de pedido (cliente o interno).
 * `status` define el contenido del mail al cliente; el checkout sin pedido en DB usa `PENDING`.
 */
export interface OrderEmailPayload {
  orderId?: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingSummary?: string;
  paymentSummary?: string;
  items: OrderLineEmailItem[];
  itemCount: number;
  subtotalFormatted: string;
  ivaFormatted: string;
  totalFormatted: string;
  status: OrderStatus;
  /** Notas u observaciones de pago/envío (una línea o varias). */
  notes?: string;
}

export interface ContactEmailPayload {
  email: string;
  empresa: string;
  telefono: string;
  mensaje: string;
  /** Nombre completo opcional (formulario contacto). */
  nombreCompleto?: string;
}

export interface NewsletterPayload {
  subject: string;
  /** HTML seguro generado en admin (contenido del cuerpo). */
  htmlBody: string;
  recipientList: string[];
}

export interface NewsletterWelcomePayload {
  email: string;
}
