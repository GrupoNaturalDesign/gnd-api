import { AdminNotificationSeverity, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { emitAdminNotification } from '../realtime/socket-server';

const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

export type AdminNotificationType =
  | 'pedido.created'
  | 'pedido.payment_approved'
  | 'pedido.status_changed'
  | 'pedido.confirmation_required'
  | 'pedido.sync_failed'
  | 'pedido.sync_recovered'
  | 'pedido.cancelled'
  | 'pedido.expired'
  | 'stock.critical';

export interface CreateAdminNotificationInput {
  empresaId: number;
  type: AdminNotificationType;
  severity?: AdminNotificationSeverity;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | number | null;
  payload?: unknown;
  dedupe?: boolean;
}

export interface NotificationListParams {
  limit?: number;
  unreadOnly?: boolean;
}

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

export class AdminNotificationService {
  async createAndEmit(input: CreateAdminNotificationInput) {
    const entityId = input.entityId != null ? String(input.entityId) : null;

    if (input.dedupe !== false && entityId) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
      const existing = await prisma.adminNotification.findFirst({
        where: {
          empresaId: input.empresaId,
          type: input.type,
          entityId,
          readAt: null,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    const notification = await prisma.adminNotification.create({
      data: {
        empresaId: input.empresaId,
        type: input.type,
        severity: input.severity ?? AdminNotificationSeverity.info,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? undefined,
        entityId: entityId ?? undefined,
        payload: asJson(input.payload),
      },
    });

    emitAdminNotification(notification);
    return notification;
  }

  async list(empresaId: number, params: NotificationListParams = {}) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    return prisma.adminNotification.findMany({
      where: {
        empresaId,
        ...(params.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(empresaId: number) {
    return prisma.adminNotification.count({
      where: { empresaId, readAt: null },
    });
  }

  async markRead(empresaId: number, id: number) {
    return prisma.adminNotification.updateMany({
      where: { id, empresaId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(empresaId: number) {
    return prisma.adminNotification.updateMany({
      where: { empresaId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async notifyPedido(input: {
    empresaId: number;
    type: AdminNotificationType;
    pedidoId: number;
    title: string;
    message: string;
    severity?: AdminNotificationSeverity;
    payload?: Record<string, unknown>;
    dedupe?: boolean;
  }) {
    return this.createAndEmit({
      empresaId: input.empresaId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      entityType: 'pedido',
      entityId: input.pedidoId,
      payload: {
        pedidoId: input.pedidoId,
        ...input.payload,
      },
      dedupe: input.dedupe,
    });
  }
}

export const adminNotificationService = new AdminNotificationService();
