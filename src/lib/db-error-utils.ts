/**
 * Utilidades para detectar errores de conexión/pool de base de datos.
 * Usado para responder 503 con mensaje amigable en lugar de exponer detalles técnicos.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = e.code as string | undefined;
  const message = typeof e.message === 'string' ? e.message : '';
  // Pool timeout (MariaDB/Prisma), códigos MySQL de conexión
  if (code === '45028') return true;
  if (message.includes('pool timeout') || message.includes('retrieve a connection from pool')) return true;
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) return true;
  if (message.includes('Connection lost') || message.includes('connection refused')) return true;
  return false;
}

export const DB_UNAVAILABLE_MESSAGE =
  'Servicio temporalmente no disponible. Por favor intentá de nuevo en unos segundos.';
