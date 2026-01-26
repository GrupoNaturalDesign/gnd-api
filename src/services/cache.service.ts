import { redisService } from '../lib/redis';
import type { RedisClientType } from '../lib/redis';

/**
 * TTL por defecto (en segundos)
 */
const DEFAULT_TTL = {
  PRODUCTS: 300, // 5 minutos
  PRODUCTS_LIST: 180, // 3 minutos
  PRODUCTS_DETAIL: 300, // 5 minutos
  CLIENTS: 300, // 5 minutos
  CLIENTS_LIST: 180, // 3 minutos
  CONFIG: 3600, // 1 hora
};

/**
 * Namespaces para keys de cache
 */
export const CACHE_NAMESPACES = {
  PRODUCTS: 'products',
  PRODUCTS_LIST: 'products:list',
  PRODUCTS_PADRE: 'products:padre',
  PRODUCTS_WEB: 'products:web',
  PRODUCTS_SLUG: 'products:slug',
  PRODUCTS_VARIANTES: 'products:variantes',
  PRODUCTS_ACTIVOS: 'products:activos',
  PRODUCTS_DESTACADOS: 'products:destacados',
  PRODUCTS_PUBLICADOS: 'products:publicados',
  CLIENTS: 'clients',
  CLIENTS_LIST: 'clients:list',
} as const;

/**
 * Servicio de Cache
 * Maneja todas las operaciones de cache con Redis
 */
export class CacheService {
  /**
   * Obtener valor del cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const client = await redisService.getClient();
      if (!client) {
        return null; // Redis no disponible, retornar null
      }

      const value = await client.get(key);
      if (!value) {
        return null;
      }

      // Parsear JSON
      try {
        const parsed = JSON.parse(value);
        if (process.env.NODE_ENV === 'development') {
          console.log(`📦 Cache HIT: ${key}`);
        }
        return parsed as T;
      } catch (parseError) {
        // Si no es JSON, retornar como string
        return value as unknown as T;
      }
    } catch (error: any) {
      // Redis falló, loguear warning pero no lanzar error
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️  Cache GET error para ${key}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Guardar valor en cache con TTL
   */
  static async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const client = await redisService.getClient();
      if (!client) {
        return false; // Redis no disponible
      }

      // Serializar valor
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      // Guardar con TTL
      if (ttlSeconds && ttlSeconds > 0) {
        await client.setEx(key, ttlSeconds, serialized);
      } else {
        // Sin TTL - usar TTL por defecto según namespace
        const defaultTtl = this.getDefaultTtl(key);
        await client.setEx(key, defaultTtl, serialized);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`💾 Cache SET: ${key} (TTL: ${ttlSeconds || this.getDefaultTtl(key)}s)`);
      }
      return true;
    } catch (error: any) {
      // Redis falló, loguear warning pero no lanzar error
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️  Cache SET error para ${key}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Eliminar key del cache
   */
  static async del(key: string): Promise<boolean> {
    try {
      const client = await redisService.getClient();
      if (!client) {
        return false;
      }

      await client.del(key);
      if (process.env.NODE_ENV === 'development') {
        console.log(`🗑️  Cache DEL: ${key}`);
      }
      return true;
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️  Cache DEL error para ${key}:`, error.message);
      }
      return false;
    }
  }

  /**
   * Invalidar todas las keys que coincidan con un patrón
   */
  static async invalidatePattern(pattern: string): Promise<number> {
    try {
      const client = await redisService.getClient();
      if (!client) {
        return 0;
      }

      // Buscar todas las keys que coincidan
      const keys: string[] = [];
      let cursor = 0;

      do {
        const result = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      // Eliminar todas las keys encontradas
      if (keys.length > 0) {
        await client.del(keys);
        if (process.env.NODE_ENV === 'development') {
          console.log(`🗑️  Cache INVALIDATE: ${keys.length} keys con patrón ${pattern}`);
        }
      }

      return keys.length;
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️  Cache INVALIDATE error para patrón ${pattern}:`, error.message);
      }
      return 0;
    }
  }

  /**
   * Obtener TTL por defecto según el namespace de la key
   */
  private static getDefaultTtl(key: string): number {
    if (key.startsWith(CACHE_NAMESPACES.PRODUCTS_LIST)) {
      return DEFAULT_TTL.PRODUCTS_LIST;
    }
    if (key.startsWith(CACHE_NAMESPACES.PRODUCTS_PADRE)) {
      return DEFAULT_TTL.PRODUCTS_DETAIL;
    }
    if (key.startsWith(CACHE_NAMESPACES.PRODUCTS)) {
      return DEFAULT_TTL.PRODUCTS;
    }
    if (key.startsWith(CACHE_NAMESPACES.CLIENTS_LIST)) {
      return DEFAULT_TTL.CLIENTS_LIST;
    }
    if (key.startsWith(CACHE_NAMESPACES.CLIENTS)) {
      return DEFAULT_TTL.CLIENTS;
    }
    return DEFAULT_TTL.CONFIG;
  }

  /**
   * Construir key de cache para productos
   */
  static buildProductKey(type: 'list' | 'padre' | 'web' | 'slug' | 'variantes' | 'activos' | 'destacados' | 'publicados', params?: Record<string, any>): string {
    const parts: string[] = [];

    switch (type) {
      case 'list':
        parts.push(CACHE_NAMESPACES.PRODUCTS_LIST);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        if (params?.rubroId) parts.push(`rubro:${params.rubroId}`);
        if (params?.subrubroId) parts.push(`subrubro:${params.subrubroId}`);
        if (params?.publicado !== undefined) parts.push(`publicado:${params.publicado}`);
        if (params?.destacado !== undefined) parts.push(`destacado:${params.destacado}`);
        if (params?.search) parts.push(`search:${params.search}`);
        if (params?.page) parts.push(`page:${params.page}`);
        if (params?.limit) parts.push(`limit:${params.limit}`);
        if (params?.includeVariantes) parts.push('variantes:true');
        break;

      case 'padre':
        parts.push(CACHE_NAMESPACES.PRODUCTS_PADRE);
        if (params?.id) parts.push(params.id);
        if (params?.includeVariantes) parts.push('variantes:true');
        break;

      case 'web':
        parts.push(CACHE_NAMESPACES.PRODUCTS_WEB);
        if (params?.id) parts.push(params.id);
        break;

      case 'slug':
        parts.push(CACHE_NAMESPACES.PRODUCTS_SLUG);
        if (params?.slug) parts.push(params.slug);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        if (params?.includeVariantes) parts.push('variantes:true');
        break;

      case 'variantes':
        parts.push(CACHE_NAMESPACES.PRODUCTS_VARIANTES);
        if (params?.productoPadreId) parts.push(params.productoPadreId);
        break;

      case 'activos':
        parts.push(CACHE_NAMESPACES.PRODUCTS_ACTIVOS);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        if (params?.rubroId) parts.push(`rubro:${params.rubroId}`);
        if (params?.subrubroId) parts.push(`subrubro:${params.subrubroId}`);
        break;

      case 'destacados':
        parts.push(CACHE_NAMESPACES.PRODUCTS_DESTACADOS);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        break;

      case 'publicados':
        parts.push(CACHE_NAMESPACES.PRODUCTS_PUBLICADOS);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        if (params?.rubroId) parts.push(`rubro:${params.rubroId}`);
        if (params?.subrubroId) parts.push(`subrubro:${params.subrubroId}`);
        break;
    }

    return parts.join(':');
  }

  /**
   * Construir key de cache para clientes
   */
  static buildClientKey(type: 'list' | 'id', params?: Record<string, any>): string {
    const parts: string[] = [];

    switch (type) {
      case 'list':
        parts.push(CACHE_NAMESPACES.CLIENTS_LIST);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        if (params?.page) parts.push(`page:${params.page}`);
        if (params?.limit) parts.push(`limit:${params.limit}`);
        if (params?.search) parts.push(`search:${params.search}`);
        if (params?.activo !== undefined) parts.push(`activo:${params.activo}`);
        break;

      case 'id':
        parts.push(CACHE_NAMESPACES.CLIENTS);
        if (params?.id) parts.push(params.id);
        if (params?.empresaId) parts.push(`empresa:${params.empresaId}`);
        break;
    }

    return parts.join(':');
  }

  /**
   * Helper para cache-aside pattern
   * Intenta obtener del cache, si no existe ejecuta la función y guarda el resultado
   */
  static async cacheAside<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Intentar obtener del cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Cache HIT: ${key}`);
      }
      return cached;
    }

    // Cache miss - obtener de la fuente de verdad
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ Cache MISS: ${key} - consultando DB`);
    }

    const data = await fetchFn();

    // Guardar en cache
    await this.set(key, data, ttlSeconds);

    return data;
  }

  /**
   * Invalidar cache de productos
   * Invalida todas las keys relacionadas con productos
   */
  static async invalidateProducts(empresaId?: number, productoId?: number): Promise<void> {
    try {
      // Invalidar todas las keys de productos
      await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS}*`);
      
      if (empresaId) {
        // Invalidar keys específicas de la empresa
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_LIST}:empresa:${empresaId}*`);
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_ACTIVOS}:empresa:${empresaId}*`);
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_DESTACADOS}:empresa:${empresaId}*`);
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_PUBLICADOS}:empresa:${empresaId}*`);
      }

      if (productoId) {
        // Invalidar keys específicas del producto
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_PADRE}:${productoId}*`);
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_VARIANTES}:${productoId}*`);
        await this.invalidatePattern(`${CACHE_NAMESPACES.PRODUCTS_SLUG}*`);
      }
    } catch (error: any) {
      // No lanzar error - invalidación es opcional
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️  Error al invalidar cache de productos:', error.message);
      }
    }
  }

  /**
   * Invalidar cache de clientes
   * Invalida todas las keys relacionadas con clientes
   */
  static async invalidateClients(empresaId?: number, clienteId?: number): Promise<void> {
    try {
      // Invalidar todas las keys de clientes
      await this.invalidatePattern(`${CACHE_NAMESPACES.CLIENTS}*`);
      
      if (empresaId) {
        // Invalidar keys específicas de la empresa
        await this.invalidatePattern(`${CACHE_NAMESPACES.CLIENTS_LIST}:empresa:${empresaId}*`);
      }

      if (clienteId) {
        // Invalidar keys específicas del cliente
        await this.invalidatePattern(`${CACHE_NAMESPACES.CLIENTS}:${clienteId}*`);
      }
    } catch (error: any) {
      // No lanzar error - invalidación es opcional
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️  Error al invalidar cache de clientes:', error.message);
      }
    }
  }
}

