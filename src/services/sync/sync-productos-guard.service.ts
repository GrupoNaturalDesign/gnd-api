import { redisService } from '../../lib/redis';

/** Tiempo mínimo entre syncs de productos (segundos) */
const COOLDOWN_SECONDS = 10 * 60; // 10 minutos

/** TTL del lock mientras corre un sync (segundos) - máximo esperado de duración */
const LOCK_TTL_SECONDS = 15 * 60; // 15 minutos

const LOCK_KEY_PREFIX = 'sync_productos_lock:';
const LAST_SYNC_KEY_PREFIX = 'sync_productos_last:';

/** Fallback in-memory cuando Redis no está disponible */
const memoryLock = new Map<number, boolean>();
const memoryLastSync = new Map<number, number>();

export interface SyncProductosGuardResult {
  allowed: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * Servicio que limita la ejecución del sync de productos:
 * - Un solo sync a la vez por empresa (lock)
 * - Cooldown mínimo entre syncs (configurable)
 * Usa Redis si está disponible; si no, fallback in-memory (válido para una sola instancia).
 */
export async function tryAcquireSyncProductosLock(empresaId: number): Promise<boolean> {
  const client = await redisService.getClient();
  if (client) {
    const key = `${LOCK_KEY_PREFIX}${empresaId}`;
    const set = await client.set(key, '1', { NX: true, EX: LOCK_TTL_SECONDS });
    return set === 'OK';
  }
  if (memoryLock.get(empresaId)) return false;
  memoryLock.set(empresaId, true);
  return true;
}

export async function releaseSyncProductosLock(empresaId: number): Promise<void> {
  const client = await redisService.getClient();
  if (client) {
    const key = `${LOCK_KEY_PREFIX}${empresaId}`;
    await client.del(key);
    return;
  }
  memoryLock.delete(empresaId);
}

export async function setSyncProductosLastRun(empresaId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const client = await redisService.getClient();
  if (client) {
    const key = `${LAST_SYNC_KEY_PREFIX}${empresaId}`;
    await client.set(key, String(now), { EX: 86400 }); // 24h
    return;
  }
  memoryLastSync.set(empresaId, now);
}

/**
 * Comprueba si la empresa está en cooldown (último sync hace menos de COOLDOWN_SECONDS).
 */
export async function checkSyncProductosCooldown(empresaId: number): Promise<SyncProductosGuardResult> {
  const client = await redisService.getClient();
  const now = Math.floor(Date.now() / 1000);
  let lastSync: number | null = null;

  if (client) {
    const key = `${LAST_SYNC_KEY_PREFIX}${empresaId}`;
    const value = await client.get(key);
    lastSync = value ? parseInt(value, 10) : null;
  } else {
    lastSync = memoryLastSync.get(empresaId) ?? null;
  }

  if (lastSync == null) return { allowed: true };
  const elapsed = now - lastSync;
  if (elapsed >= COOLDOWN_SECONDS) return { allowed: true };
  const retryAfterSeconds = COOLDOWN_SECONDS - elapsed;
  return {
    allowed: false,
    error: `Espere antes de sincronizar de nuevo. Última sincronización hace ${Math.ceil(elapsed / 60)} min.`,
    retryAfterSeconds,
  };
}

/**
 * Verifica si se puede iniciar un sync: lock libre y fuera de cooldown.
 * No adquiere el lock; eso debe hacerse con tryAcquireSyncProductosLock justo después.
 */
export async function canRunSyncProductos(empresaId: number): Promise<SyncProductosGuardResult> {
  const cooldown = await checkSyncProductosCooldown(empresaId);
  if (!cooldown.allowed) return cooldown;
  return { allowed: true };
}
