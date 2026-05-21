import type { CuponDetalle } from '../services/cupon-engine.service';

/** Parsea el JSON guardado en `pedidos.cupon_detalle_snapshot`. */
export function parseCuponDetalleSnapshot(raw: unknown): CuponDetalle | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<CuponDetalle>;
  if (!Array.isArray(d.detallePorItem) || d.detallePorItem.length === 0) {
    return null;
  }
  return d as CuponDetalle;
}

/**
 * % de descuento S-Factory (0–100) para una línea, a partir del detalle del cupón.
 * `detallePorItem.productoId` coincide con `productoWebId` del pedido.
 */
export function sfactoryDescuentoPctFromCuponLine(
  productoWebId: number | null | undefined,
  cuponDetalle: CuponDetalle | null
): number | undefined {
  if (!cuponDetalle?.detallePorItem?.length || productoWebId == null) {
    return undefined;
  }

  const row = cuponDetalle.detallePorItem.find((d) => d.productoId === productoWebId);
  if (!row || row.precioOriginal <= 0 || row.descuento <= 0) {
    return undefined;
  }

  const pct = (row.descuento / row.precioOriginal) * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded <= 0) return undefined;
  return Math.min(100, rounded);
}

/**
 * Si no hay snapshot por ítem, reparte el descuento total como % único sobre el subtotal.
 */
export function sfactoryDescuentoPctGlobal(
  subtotalLineas: number,
  cuponDescuentoTotal: number
): number | undefined {
  if (subtotalLineas <= 0 || cuponDescuentoTotal <= 0) return undefined;
  const pct = (cuponDescuentoTotal / subtotalLineas) * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded <= 0) return undefined;
  return Math.min(100, rounded);
}

export function appendCuponObservaciones(
  observaciones: string | null | undefined,
  cuponCodigo: string | null | undefined
): string | undefined {
  const parts = [observaciones?.trim(), cuponCodigo ? `Cupón web: ${cuponCodigo}` : null].filter(
    Boolean
  ) as string[];
  return parts.length > 0 ? parts.join(' | ') : undefined;
}
