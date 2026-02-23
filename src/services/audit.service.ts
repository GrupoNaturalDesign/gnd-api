import { prisma } from '../lib/prisma';
import type { AuditEntity, AuditAction } from '@prisma/client';
import type { Request } from 'express';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Mapeo de path base (sin query) a entidad de auditoría */
const PATH_TO_ENTITY: Record<string, AuditEntity> = {
  '/api/productos': 'producto_padre',
  '/api/productos-web': 'producto_web',
  '/api/productos-precios': 'producto_precio',
  '/api/product-images': 'producto_imagen',
  '/api/clientes': 'cliente',
  '/api/pedidos': 'pedido',
  '/api/rubros': 'rubro',
  '/api/subrubros': 'subrubro',
  '/api/sync': 'sync',
  '/api/sfactory/auth': 'sesion',
};

export interface AuditLogParams {
  entity: AuditEntity;
  entityId?: string | number | null;
  action: AuditAction;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  empresaId?: number | null;
  userId?: number | null;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  method?: string | null;
  path?: string | null;
}

/**
 * Infiere la entidad de auditoría desde el path del request.
 * Ej: /api/productos/123 -> producto_padre, /api/clientes -> cliente
 */
export function inferEntityFromPath(path: string): AuditEntity {
  const basePath = path.split('?')[0]?.replace(/\/\d+(\/|$)/g, '/').replace(/\/$/, '') || '/';
  for (const [prefix, entity] of Object.entries(PATH_TO_ENTITY)) {
    if (entity && (basePath === prefix || basePath.startsWith(prefix + '/'))) {
      return entity;
    }
  }
  return 'otro';
}

/**
 * Infiere la acción desde el método HTTP.
 */
export function inferActionFromMethod(method: string): AuditAction {
  const m = method.toUpperCase();
  if (m === 'POST') return 'CREATE';
  if (m === 'PUT' || m === 'PATCH') return 'UPDATE';
  if (m === 'DELETE') return 'DELETE';
  return 'UPDATE';
}

/**
 * Extrae un posible entityId del path (primer número que parezca ID).
 */
export function inferEntityIdFromPath(path: string): string | null {
  const part = path.split('?')[0];
  const segments = (part ?? path).split('/').filter(Boolean);
  for (const seg of segments) {
    if (typeof seg === 'string' && /^\d+$/.test(seg)) return seg;
  }
  return null;
}

/**
 * Registra un evento en audit_logs.
 * No lanza errores para no afectar la respuesta al cliente.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entity: params.entity,
        entityId: params.entityId != null ? String(params.entityId) : null,
        action: params.action,
        oldValues: (params.oldValues ?? undefined) as object | undefined,
        newValues: (params.newValues ?? undefined) as object | undefined,
        empresaId: params.empresaId ?? undefined,
        userId: params.userId ?? undefined,
        userEmail: params.userEmail ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
        method: params.method ?? undefined,
        path: params.path ?? undefined,
      },
    });
  } catch (err) {
    console.error('[AuditService] Error escribiendo log de auditoría:', err);
  }
}

export interface AuditLogListParams {
  empresaId: number;
  page?: number;
  limit?: number;
  entity?: string;
  userId?: number;
  userEmail?: string;
  dateFrom?: string; // ISO date
  dateTo?: string;
  action?: string;
  method?: string;
}

export interface AuditLogListResult {
  data: Array<{
    id: number;
    empresaId: number | null;
    entity: string;
    entityId: string | null;
    action: string;
    oldValues: unknown;
    newValues: unknown;
    summary: string | null;
    userId: number | null;
    userEmail: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    method: string | null;
    path: string | null;
    createdAt: Date;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * Lista logs de auditoría con paginación y filtros.
 */
export async function listAuditLogs(params: AuditLogListParams): Promise<AuditLogListResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { empresaId: params.empresaId };

  if (params.entity) where.entity = params.entity;
  if (params.userId != null) where.userId = params.userId;
  if (params.userEmail) where.userEmail = { contains: params.userEmail };
  if (params.action) where.action = params.action;
  if (params.method) where.method = params.method;

  if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(params.dateFrom);
    if (params.dateTo) {
      const d = new Date(params.dateTo);
      d.setHours(23, 59, 59, 999);
      (where.createdAt as Record<string, Date>).lte = d;
    }
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: data.map((row) => ({
      id: row.id,
      empresaId: row.empresaId,
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      oldValues: row.oldValues,
      newValues: row.newValues,
      summary: computeAuditSummary(row.oldValues, row.newValues, row.entity),
      userId: row.userId,
      userEmail: row.userEmail,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      method: row.method,
      path: row.path,
      createdAt: row.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Genera un resumen legible del cambio (antes → después) para mostrar en la UI.
 */
export function computeAuditSummary(
  oldValues: unknown,
  newValues: unknown,
  entity?: string
): string | null {
  const oldObj = oldValues && typeof oldValues === 'object' && !Array.isArray(oldValues) ? (oldValues as Record<string, unknown>) : null;
  const newObj = newValues && typeof newValues === 'object' && !Array.isArray(newValues) ? (newValues as Record<string, unknown>) : null;

  if (!oldObj && !newObj) return null;
  if (!newObj && oldObj) {
    const parts: string[] = [];
    if (oldObj.publicado !== undefined) parts.push(`publicado: ${oldObj.publicado}`);
    if (oldObj.destacado !== undefined) parts.push(`destacado: ${oldObj.destacado}`);
    if (oldObj.nombre !== undefined) parts.push(`nombre: "${String(oldObj.nombre).slice(0, 30)}..."`);
    return parts.length ? `Eliminado (${parts.join(', ')})` : 'Registro eliminado';
  }

  const skipKeys = new Set(['createdAt', 'updatedAt', 'empresaId', 'rubro', 'subrubro', '_count', 'productosWeb']);
  const changes: string[] = [];

  const allKeys = new Set([...(oldObj ? Object.keys(oldObj) : []), ...(newObj ? Object.keys(newObj) : [])]);
  for (const key of allKeys) {
    if (skipKeys.has(key)) continue;
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];
    if (oldVal === newVal) continue;
    if (typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal) && (newVal as any)?.id) continue;
    const oldStr = oldVal === undefined || oldVal === null ? '—' : String(oldVal);
    const newStr = newVal === undefined || newVal === null ? '—' : String(newVal);
    if (key === 'publicado') {
      if (newVal === true) changes.push('Se publicó el producto');
      else if (newVal === false) changes.push('Se despublicó el producto');
      else changes.push(`publicado: ${oldStr} → ${newStr}`);
    } else if (key === 'destacado') {
      if (newVal === true) changes.push('Se destacó el producto');
      else if (newVal === false) changes.push('Se quitó el destacado');
      else changes.push(`destacado: ${oldStr} → ${newStr}`);
    } else {
      changes.push(`${key}: ${oldStr} → ${newStr}`);
    }
  }
  return changes.length ? changes.join('; ') : null;
}

/**
 * Registra auditoría desde un request (middleware global).
 * No registra si el controller ya registró auditoría explícita (req.auditLogged).
 */
export async function logAuditFromRequest(
  req: Request,
  options?: { entity?: AuditEntity; entityId?: string | null; newValues?: Record<string, unknown> | null }
): Promise<void> {
  if ((req as any).auditLogged) return;
  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.includes(method)) return;

  const path = req.originalUrl?.split('?')[0] ?? (req.baseUrl && req.path ? `${req.baseUrl}${req.path}` : req.path) ?? '';
  const entity = options?.entity ?? inferEntityFromPath(path);
  const entityId = options?.entityId ?? inferEntityIdFromPath(path);
  const action = inferActionFromMethod(method);

  await logAudit({
    entity,
    entityId,
    action,
    newValues: options?.newValues ?? (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : undefined),
    empresaId: req.empresaId ?? undefined,
    userId: req.userId ?? undefined,
    userEmail: req.userEmail ?? undefined,
    ipAddress: (req.ip ?? req.socket?.remoteAddress) ?? undefined,
    userAgent: req.get?.('user-agent') ?? undefined,
    method: req.method,
    path: path || undefined,
  });
}
