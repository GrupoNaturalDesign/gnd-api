import { Request, Response, NextFunction } from 'express';
import { subrubroService } from '../services';
import {
  SubrubroQueryParamsSchema,
  SubrubroByIdParamsSchema,
  SubrubroBySlugParamsSchema,
  ApiResponse,
} from '../types';
import { ZodError } from 'zod';

export class SubrubroController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const params = SubrubroQueryParamsSchema.parse(req.query) as Parameters<typeof subrubroService.getAll>[0];
      const subrubros = await subrubroService.getAll(params);

      const response: ApiResponse = {
        success: true,
        data: subrubros,
        message: 'Subrubros obtenidos exitosamente',
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
      const { id } = SubrubroByIdParamsSchema.parse({
        id: req.params.id,
        includeProductos: req.query.includeProductos,
      });

      const includeProductos = req.query.includeProductos === 'true';
      const subrubro = await subrubroService.getById(id, includeProductos);

      if (!subrubro) {
        return res.status(404).json({
          success: false,
          message: 'Subrubro no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: subrubro,
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
      const params = SubrubroBySlugParamsSchema.parse({
        slug: req.params.slug,
        empresaId: req.query.empresaId,
      });

      const subrubro = await subrubroService.getBySlug(
        params.slug,
        params.empresaId
      );

      if (!subrubro) {
        return res.status(404).json({
          success: false,
          message: 'Subrubro no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: subrubro,
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

export const subrubroController = new SubrubroController();

