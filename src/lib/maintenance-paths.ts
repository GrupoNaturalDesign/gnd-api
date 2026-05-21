/**
 * Clasificación de rutas HTTP para el middleware de mantenimiento.
 */

/** Normaliza path sin query (Express req.path ya viene sin query). */
export function normalizeApiPath(path: string): string {
  const p = path.split('?')[0] ?? path;
  if (p.length > 1 && p.endsWith('/')) {
    return p.slice(0, -1);
  }
  return p;
}

/** Integraciones y monitoreo: nunca bloquear. */
export function isMaintenanceAllowlistedPath(
  path: string,
  method: string
): boolean {
  const p = normalizeApiPath(path);
  const m = method.toUpperCase();

  if (p === '/health' || p === '/api/health') {
    return true;
  }
  if (p.startsWith('/api/webhooks/')) {
    return true;
  }
  if (p === '/api/orders/status' && m === 'POST') {
    return true;
  }
  return false;
}

const PUBLIC_PRODUCTOS_GET = new Set([
  '/api/productos/activos',
  '/api/productos/publicados',
  '/api/productos/destacados',
  '/api/productos/sfactory',
]);

function isPublicProductosGet(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'GET') {
    return false;
  }
  if (PUBLIC_PRODUCTOS_GET.has(path)) {
    return true;
  }
  return /^\/api\/productos\/slug\/[^/]+$/.test(path);
}

/** Rutas de panel / mutaciones admin (bloqueadas con admin | all). */
export function isAdminApiPath(path: string, method: string): boolean {
  const p = normalizeApiPath(path);
  const m = method.toUpperCase();

  const adminPrefixes = [
    '/api/admin/',
    '/api/pedidos',
    '/api/product-images',
    '/api/productos-web',
    '/api/productos-precios',
    '/api/sync',
    '/api/sfactory/ventas',
    '/api/audit-logs',
    '/api/shipping/correo/test',
  ];

  if (adminPrefixes.some((prefix) => p === prefix || p.startsWith(prefix))) {
    return true;
  }

  if (p.startsWith('/api/clientes')) {
    return !(p === '/api/clientes/sfactory' && m === 'GET');
  }

  if (p.startsWith('/api/productos')) {
    return !isPublicProductosGet(p, m);
  }

  return false;
}
