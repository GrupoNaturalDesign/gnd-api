/**
 * Deduplica variantes web con la misma combinación color + talle (p. ej. códigos
 * SF viejos y nuevos apuntando al mismo sfactoryId). Conserva la fila con más stock,
 * luego mayor precio, luego id más alto (registro más reciente).
 */
export function deduplicateProductosWeb<T extends {
  id: number;
  color?: string | null;
  talle?: string | null;
  stockCache?: unknown;
  precioCache?: unknown;
  precios?: Array<{ precioLista?: unknown }>;
}>(variantes: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const v of variantes) {
    const key = `${v.color ?? ''}|${v.talle ?? ''}`;
    const existing = byKey.get(key);
    if (!existing || scoreProductoWeb(v) > scoreProductoWeb(existing)) {
      byKey.set(key, v);
    }
  }

  return Array.from(byKey.values());
}

export function scoreProductoWeb(v: {
  id: number;
  stockCache?: unknown;
  precioCache?: unknown;
  precios?: Array<{ precioLista?: unknown }>;
}): number {
  const stock = Number(v.stockCache ?? 0);
  const precioCache = Number(v.precioCache ?? 0);
  const precioLista = Number(v.precios?.[0]?.precioLista ?? 0);
  const precio = precioCache > 0 ? precioCache : precioLista;
  return stock * 1_000_000 + precio * 1_000 + v.id;
}

/** Agrupa por productoPadreId + sfactoryId y devuelve keeper + losers por grupo. */
export function splitKeeperAndLosers<T extends {
  id: number;
  productoPadreId: number;
  sfactoryId: number;
  stockCache?: unknown;
  precioCache?: unknown;
  precios?: Array<{ precioLista?: unknown }>;
}>(rows: T[]): Array<{ keeper: T; losers: T[] }> {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.productoPadreId}:${row.sfactoryId}`;
    const group = byKey.get(key) ?? [];
    group.push(row);
    byKey.set(key, group);
  }

  const result: Array<{ keeper: T; losers: T[] }> = [];
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => scoreProductoWeb(b) - scoreProductoWeb(a));
    const keeper = sorted[0]!;
    result.push({ keeper, losers: sorted.slice(1) });
  }
  return result;
}
