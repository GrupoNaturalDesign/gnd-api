import { Request, Response, NextFunction } from 'express';
import { listAuditLogs } from '../services/audit.service';

export class AuditController {
  /**
   * GET /api/audit-logs
   * Lista logs de auditoría con paginación y filtros.
   * empresaId viene de empresaMiddleware (por ahora) o de requireAuth (cuando auth esté activo).
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message:
            'No se pudo obtener empresaId. Inicializa la sesión con POST /api/sfactory/auth/init (companyKey) o, cuando auth esté activo, envía el token Bearer.',
        });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const entity = req.query.entity as string | undefined;
      const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
      const userEmail = req.query.userEmail as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const action = req.query.action as string | undefined;
      const method = req.query.method as string | undefined;

      const result = await listAuditLogs({
        empresaId,
        page,
        limit,
        entity,
        userId,
        userEmail,
        dateFrom,
        dateTo,
        action,
        method,
      });

      res.json({
        success: true,
        data: result.data,
        message: 'Logs de auditoría obtenidos',
        pagination: result.pagination,
      });
    } catch (error: unknown) {
      console.error('[AuditController.list] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al listar auditoría',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }
}

export const auditController = new AuditController();
