/**
 * Totales de pedido ecommerce.
 *
 * Convención de persistencia (checkout):
 * - `total` = subtotal productos + envío (bruto, sin restar cupón)
 * - `descuento` = monto de descuento a aplicar (hoy: cupón)
 * - `cuponDescuentoTotal` = snapshot del cupón (mismo valor que `descuento` cuando hay cupón)
 *
 * El monto real cobrado / a cobrar es `total − descuento` (no sumar descuento + cuponDescuentoTotal).
 */

export type PedidoTotalsFields = {
  total: { toString(): string } | string | number | null | undefined;
  descuento?: { toString(): string } | string | number | null;
  cuponDescuentoTotal?: { toString(): string } | string | number | null;
};

function toNum(value: PedidoTotalsFields['total']): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Descuento efectivo del pedido.
 * Prioriza `descuento`; si es 0, cae a `cuponDescuentoTotal` (pedidos legacy / inconsistentes).
 * No suma ambos: en checkout se persisten con el mismo monto.
 */
export function computePedidoDescuentoTotal(pedido: PedidoTotalsFields): number {
  const d = toNum(pedido.descuento);
  if (d > 0) return Number(d.toFixed(2));
  const cupon = toNum(pedido.cuponDescuentoTotal);
  return cupon > 0 ? Number(cupon.toFixed(2)) : 0;
}

/** Monto real cobrado / a cobrar (bruto − descuento). */
export function computePedidoTotalNeto(pedido: PedidoTotalsFields): number {
  const gross = toNum(pedido.total);
  const descuento = computePedidoDescuentoTotal(pedido);
  const net = Number((gross - descuento).toFixed(2));
  return net >= 0 ? net : gross;
}
