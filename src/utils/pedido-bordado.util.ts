/** Resumen de ítems con bordado para observaciones del pedido (S-Factory / admin). */
export function buildBordadoObservacionesResumen(
  items: Array<{ nombre: string; cantidad: number | string; bordado?: boolean | null }>
): string | null {
  const lines = items
    .filter((it) => it.bordado === true)
    .map((it) => {
      const qty = Number(it.cantidad);
      const qtyLabel = Number.isFinite(qty) && qty > 1 ? ` ×${qty}` : '';
      return `${it.nombre.trim()}${qtyLabel}`;
    });

  if (lines.length === 0) return null;
  return `Bordado solicitado: ${lines.join(', ')}`;
}

/** Concatena observaciones existentes con resumen de bordado. */
export function appendBordadoObservaciones(
  observaciones: string | null | undefined,
  items: Array<{ nombre: string; cantidad: number | string; bordado?: boolean | null }>
): string | undefined {
  const resumen = buildBordadoObservacionesResumen(items);
  if (!resumen) {
    const trimmed = observaciones?.trim();
    return trimmed || undefined;
  }
  const base = observaciones?.trim();
  return base ? `${base}\n${resumen}` : resumen;
}
