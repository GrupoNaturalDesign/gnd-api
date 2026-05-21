import { Request, Response } from 'express';
import type { ApiResponse } from '../types';
import { adminNotificationService } from '../services/admin-notification.service';

function getEmpresaId(req: Request): number {
  const empresaId = Number((req as any).empresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('No se pudo obtener empresaId.');
  }
  return empresaId;
}

export class AdminNotificationsController {
  async list(req: Request, res: Response) {
    try {
      const limit = req.query.limit != null ? Number(req.query.limit) : 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      const data = await adminNotificationService.list(getEmpresaId(req), {
        limit: Number.isFinite(limit) ? limit : 20,
        unreadOnly,
      });
      res.json({ success: true, data, message: 'Notificaciones admin' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al listar notificaciones', message });
    }
  }

  async unreadCount(req: Request, res: Response) {
    try {
      const count = await adminNotificationService.getUnreadCount(getEmpresaId(req));
      res.json({ success: true, data: { count }, message: 'Notificaciones no leídas' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al contar notificaciones', message });
    }
  }

  async markRead(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
      }
      const data = await adminNotificationService.markRead(getEmpresaId(req), id);
      res.json({ success: true, data, message: 'Notificación marcada como leída' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al marcar notificación', message });
    }
  }

  async markAllRead(req: Request, res: Response) {
    try {
      const data = await adminNotificationService.markAllRead(getEmpresaId(req));
      res.json({ success: true, data, message: 'Notificaciones marcadas como leídas' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al marcar notificaciones', message });
    }
  }
}

export const adminNotificationsController = new AdminNotificationsController();
