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
      const params = RubroQueryParamsSchema.parse(req.query) as Parameters<typeof rubroService.getAll>[0];
      const rubros = await rubroService.getAll(params);

      const response: ApiResponse = {
        success: true,
        data: rubros,
        message: 'Rubros obtenidos exitosamente',
      };

      res.json(response);
    } catch (error) {
      if (error instanceof ZodError) {
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
          details: error.errors,
        });
      }
      next(error);
    }
  }

  async getBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const params = RubroBySlugParamsSchema.parse({
        slug: req.params.slug,
        empresaId: req.query.empresaId,
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
          details: error.errors,
        });
      }
      next(error);
    }
  }
}

export const rubroController = new RubroController();

