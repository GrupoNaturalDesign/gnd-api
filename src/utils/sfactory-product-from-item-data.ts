import type { SFactoryItemCreateData, SFactoryProduct } from '../types/sfactory.types';

/**
 * Construye un SFactoryProduct mínimo desde datos enviados a crear/editar item,
 * con las variantes de nombre que usa el sync (PascalCase y camelCase).
 */
export function buildSFactoryProductFromItemData(
  codigo: string,
  data: SFactoryItemCreateData,
  itemId: number | null
): SFactoryProduct {
  const descripcion = data.descripcion || data.descrip_corta || codigo;
  return {
    Codigo: codigo,
    codigo,
    Tipo: data.tipo || 'P',
    tipo: data.tipo || 'P',
    Descripcion: descripcion,
    descripcion,
    DescripcionCorta: data.descrip_corta ?? null,
    descrip_corta: data.descrip_corta ?? null,
    descripcionCorta: data.descrip_corta ?? null,
    Detalle: data.detalle ?? null,
    detalle: data.detalle ?? null,
    PrecioCosto: data.precio_costo ?? null,
    precioCosto: data.precio_costo ?? null,
    PrecioVenta: data.precio_venta ?? null,
    precioVenta: data.precio_venta ?? null,
    rubro_id: data.rubro_id ?? undefined,
    subrubro_id: data.subrubro_id ?? undefined,
    id: itemId ?? undefined,
    Id: itemId ?? undefined,
  };
}

/**
 * Completa campos que SFactory a veces no devuelve al leer, con los valores enviados en la mutación.
 */
export function mergeSFactoryProductWithItemData(
  producto: SFactoryProduct,
  data: SFactoryItemCreateData
): SFactoryProduct {
  const merged: SFactoryProduct = { ...producto };

  const raw = merged as Record<string, unknown>;
  if (data.rubro_id != null) {
    const existing = raw.rubro_id ?? raw.RubroId;
    merged.rubro_id = typeof existing === 'number' ? existing : data.rubro_id;
  }
  if (data.subrubro_id != null) {
    const existing = raw.subrubro_id ?? raw.SubrubroId;
    merged.subrubro_id = typeof existing === 'number' ? existing : data.subrubro_id;
  }
  if (data.descrip_corta != null && data.descrip_corta !== '') {
    merged.descrip_corta = (merged as Record<string, unknown>).descrip_corta
      ?? (merged as Record<string, unknown>).DescripcionCorta
      ?? data.descrip_corta;
    (merged as Record<string, unknown>).DescripcionCorta = data.descrip_corta;
  }
  if (data.detalle != null && data.detalle !== '') {
    merged.detalle = (merged as Record<string, unknown>).detalle
      ?? (merged as Record<string, unknown>).Detalle
      ?? data.detalle;
    (merged as Record<string, unknown>).Detalle = data.detalle;
  }
  if (data.precio_costo != null) {
    merged.PrecioCosto = merged.PrecioCosto ?? data.precio_costo;
  }
  if (data.precio_venta != null) {
    merged.PrecioVenta = merged.PrecioVenta ?? data.precio_venta;
  }

  return merged;
}
