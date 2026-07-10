/** Extrae el id de orden PE desde la respuesta de ventas_crear_pedido_externo. */
export function parseSfactoryOrdenId(response: unknown): number | null {
  if (response == null) return null;
  if (typeof response === 'object') {
    const o = response as Record<string, unknown>;
    const tryNum = (v: unknown) => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
      return null;
    };
    const direct =
      tryNum(o.id) ??
      tryNum(o.orden_id) ??
      tryNum(o.order_id);
    if (direct != null) return direct;
    const data = o.data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      return tryNum(d.id) ?? tryNum(d.orden_id) ?? null;
    }
  }
  return null;
}

export function parseSfactoryEstado(response: unknown): string | null {
  if (response == null || typeof response !== 'object') return null;
  const o = response as Record<string, unknown>;
  const direct = o.estado ?? o.estadoInterno ?? o.Estado;
  if (typeof direct === 'string') return direct;
  if (typeof direct === 'number' && Number.isFinite(direct)) return String(direct);
  const data = o.data;
  if (data && typeof data === 'object') {
    return parseSfactoryEstado(data);
  }
  return null;
}

/** Total de productos calculado por S-Factory (lista de precios, IVA, descuentos ERP). */
export function parseSfactoryTotal(response: unknown): number | null {
  if (response == null || typeof response !== 'object') return null;
  const o = response as Record<string, unknown>;
  const raw = o.total ?? o.Total;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  const data = o.data;
  if (data && typeof data === 'object') {
    return parseSfactoryTotal(data);
  }
  return null;
}

/** Total a cobrar al cliente: productos (S-Factory) + envío postal (GND). */
export function computeTotalACobrar(sfactoryTotalProductos: number, costoEnvio: number): number {
  const productos = Number.isFinite(sfactoryTotalProductos) ? sfactoryTotalProductos : 0;
  const envio = Number.isFinite(costoEnvio) ? costoEnvio : 0;
  return Number((productos + envio).toFixed(2));
}
