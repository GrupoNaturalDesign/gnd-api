import { Request, Response } from 'express';
import type { ApiResponse } from '../types';
import { adminSearchService } from '../services/admin-search.service';
import { adminSearchQuerySchema } from '../validation/admin-search.schema';

function getEmpresaId(req: Request): number {
  const empresaId = Number((req as Request & { empresaId?: number }).empresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('No se pudo obtener empresaId.');
  }
  return empresaId;
}

export class AdminSearchController {
  async search(req: Request, res: Response) {
    try {
      const query = adminSearchQuerySchema.parse(req.query);
      const results = await adminSearchService.search(getEmpresaId(req), query.q, query.limit);
      const response: ApiResponse = {
        success: true,
        data: { results },
        message: 'Búsqueda admin',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        success: false,
        error: 'Error en búsqueda admin',
        message,
      });
    }
  }
}

export const adminSearchController = new AdminSearchController();
