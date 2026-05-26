import { redisService } from '../../lib/redis';

const COOLDOWN_SECONDS = 10 * 60;
const LOCK_TTL_SECONDS = 15 * 60;

const LOCK_KEY_PREFIX = 'sync_clientes_lock:';
const LAST_SYNC_KEY_PREFIX = 'sync_clientes_last:';

const memoryLock = new Map<number, boolean>();
const memoryLastSync = new Map<number, number>();

export interface SyncClientesGuardResult {
  allowed: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export async function tryAcquireSyncClientesLock(empresaId: number): Promise<boolean> {
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

export async function releaseSyncClientesLock(empresaId: number): Promise<void> {
  const client = await redisService.getClient();
  if (client) {
    await client.del(`${LOCK_KEY_PREFIX}${empresaId}`);
    return;
  }
  memoryLock.delete(empresaId);
}

export async function setSyncClientesLastRun(empresaId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const client = await redisService.getClient();
  if (client) {
    await client.set(`${LAST_SYNC_KEY_PREFIX}${empresaId}`, String(now), { EX: 86400 });
    return;
  }
  memoryLastSync.set(empresaId, now);
}

export async function checkSyncClientesCooldown(empresaId: number): Promise<SyncClientesGuardResult> {
  const client = await redisService.getClient();
  const now = Math.floor(Date.now() / 1000);
  let lastSync: number | null = null;

  if (client) {
    const value = await client.get(`${LAST_SYNC_KEY_PREFIX}${empresaId}`);
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
    error: `Espere antes de sincronizar clientes de nuevo. Última sincronización hace ${Math.ceil(elapsed / 60)} min.`,
    retryAfterSeconds,
  };
}
