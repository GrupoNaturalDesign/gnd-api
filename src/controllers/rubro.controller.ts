import { Request, Response, NextFunction } from 'express';
import { rubroService } from '../services';
import {
  RubroQueryParamsSchema,
  RubroByIdParamsSchema,
  RubroBySlugParamsSchema,
  ApiResponse,
} from '../types';
import { ZodError } from 'zod';

export class RubroController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      // Obtener empresaId del middleware (inyectado automáticamente)
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId. Inicializa la sesión con SFactory primero.',
          details: [
            {
              code: 'session_not_initialized',
              path: ['empresaId'],
              message: 'Inicializa la sesión con POST /api/sfactory/auth/init',
            },
          ],
        });
      }
      
      const params = RubroQueryParamsSchema.parse(req.query) as Parameters<typeof rubroService.getAll>[0];
      const resultado = await rubroService.getAll({ ...params, empresaId });

      const response: ApiResponse = {
        success: true,
        data: resultado.data,
        message: 'Rubros obtenidos exitosamente',
      };

      // Agregar información de paginación a la respuesta
      res.json({
        ...response,
        pagination: resultado.pagination,
      });
    } catch (error) {
      console.error('[RubroController.getAll] Error:', error);
      if (error instanceof ZodError) {
        console.error('[RubroController.getAll] Errores de validación:', error.issues);
        return res.status(400).json({
          success: false,
          error: 'Parámetros de consulta inválidos',
          details: error.issues,
        });
      }
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = RubroByIdParamsSchema.parse({
        id: req.params.id,
        includeSubrubros: req.query.includeSubrubros,
      });

      const includeSubrubros = req.query.includeSubrubros === 'true';
      const rubro = await rubroService.getById(id, includeSubrubros);

      if (!rubro) {
        return res.status(404).json({
          success: false,
          message: 'Rubro no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: rubro,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'ID inválido',
          details: error.issues,
        });
      }
      next(error);
    }
  }

  async getBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId. Inicializa la sesión con SFactory primero.',
        });
      }
      
      const params = RubroBySlugParamsSchema.parse({
        slug: req.params.slug,
        empresaId,
      });

      const rubro = await rubroService.getBySlug(params.slug, params.empresaId);

      if (!rubro) {
        return res.status(404).json({
          success: false,
          message: 'Rubro no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: rubro,
      };

      res.json(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          details: error.issues,
        });
      }
      next(error);
    }
  }
}

export const rubroController = new RubroController();

