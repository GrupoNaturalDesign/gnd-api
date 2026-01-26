import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Client Singleton
 * Una sola conexión Redis reutilizada en toda la aplicación
 */
class RedisService {
  private static instance: RedisService;
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  private constructor() {
    // Constructor privado para singleton
  }

  /**
   * Obtener instancia singleton
   */
  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Obtener cliente Redis (lazy initialization)
   */
  public async getClient(): Promise<RedisClientType | null> {
    // Si ya está conectado, retornar cliente
    if (this.isConnected && this.client) {
      return this.client;
    }

    // Si hay una conexión en progreso, esperarla
    if (this.connectionPromise) {
      await this.connectionPromise;
      return this.client;
    }

    // Iniciar nueva conexión
    this.connectionPromise = this.connect();
    await this.connectionPromise;
    return this.client;
  }

  /**
   * Conectar a Redis
   */
  private async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL;

      // Si no hay REDIS_URL, Redis es opcional
      if (!redisUrl) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️  REDIS_URL no configurado. Redis será opcional.');
        }
        this.client = null;
        this.isConnected = false;
        return;
      }

      // Crear cliente Redis
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Redis: Máximo de reintentos alcanzado');
              return new Error('Máximo de reintentos alcanzado');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      // Manejar errores
      this.client.on('error', (err) => {
        console.error('❌ Redis Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔌 Redis: Conectando...');
        }
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Redis: Conectado y listo');
        }
      });

      this.client.on('reconnecting', () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔄 Redis: Reconectando...');
        }
        this.isConnected = false;
      });

      // Conectar
      await this.client.connect();
    } catch (error: any) {
      console.error('❌ Redis: Error al conectar:', error.message);
      this.client = null;
      this.isConnected = false;
      // No lanzar error - Redis es opcional
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Verificar si Redis está disponible
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (!client) return false;
      await client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cerrar conexión (útil para tests o shutdown graceful)
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (error: any) {
        console.error('❌ Redis: Error al desconectar:', error.message);
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }
}

// Exportar instancia singleton
export const redisService = RedisService.getInstance();

// Exportar tipo para uso en otros módulos
export type { RedisClientType };

