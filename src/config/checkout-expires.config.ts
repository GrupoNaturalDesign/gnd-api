import { FormaPago } from '@prisma/client';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n)) return Math.floor(n);
  return fallback;
}

/** Horas de validez del pedido desde `fechaPedido` (default global). */
export function getCheckoutPedidoExpiresHours(): number {
  const n = envInt('CHECKOUT_PEDIDO_EXPIRES_HOURS', 48);
  return Math.min(Math.max(n, 1), 720);
}

/** Override MP; fallback a minutos legacy si no hay horas. */
export function getCheckoutMpExpiresHours(): number {
  const hoursRaw = process.env.CHECKOUT_MP_EXPIRES_HOURS?.trim();
  if (hoursRaw) {
    const n = Number(hoursRaw);
    if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 720);
  }
  const minutesRaw = process.env.CHECKOUT_MP_EXPIRES_MINUTES?.trim();
  if (minutesRaw) {
    const m = Number(minutesRaw);
    if (Number.isFinite(m) && m >= 5) {
      return Math.min(Math.max(Math.ceil(m / 60), 1), 720);
    }
  }
  return getCheckoutPedidoExpiresHours();
}

/** Override transferencia/efectivo; fallback a CHECKOUT_MANUAL_EXPIRES_HOURS legacy. */
export function getCheckoutManualExpiresHours(): number {
  const hoursRaw = process.env.CHECKOUT_MANUAL_EXPIRES_HOURS?.trim();
  if (hoursRaw) {
    const n = Number(hoursRaw);
    if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 720);
  }
  const legacyDays = process.env.CHECKOUT_MANUAL_EXPIRES_DAYS?.trim();
  if (legacyDays) {
    const d = Number(legacyDays);
    if (Number.isFinite(d) && d >= 1) return Math.min(Math.floor(d * 24), 720);
  }
  return getCheckoutPedidoExpiresHours();
}

export function resolveCheckoutExpiresHours(formaPago: FormaPago | null | undefined): number {
  if (formaPago === FormaPago.mercado_pago) return getCheckoutMpExpiresHours();
  if (formaPago === FormaPago.transferencia || formaPago === FormaPago.efectivo) {
    return getCheckoutManualExpiresHours();
  }
  return getCheckoutPedidoExpiresHours();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function computePedidoExpiresAt(
  formaPago: FormaPago | null | undefined,
  fechaPedido: Date = new Date()
): Date {
  return addHours(fechaPedido, resolveCheckoutExpiresHours(formaPago));
}

/** Ventana para alerta "próximos a vencer" en dashboard/job. */
export function getCheckoutExpiryWarningHours(): number {
  const n = envInt('CHECKOUT_EXPIRY_WARNING_HOURS', 12);
  return Math.min(Math.max(n, 1), 168);
}

/** Tolerancia ARS para auditoría SF vs subtotal local (no bloquea). */
export function getCheckoutSfPriceAuditTolerance(): number {
  const raw = process.env.CHECKOUT_SF_PRICE_AUDIT_TOLERANCE?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 0.05;
}
