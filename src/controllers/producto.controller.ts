import { Request, Response, NextFunction } from 'express';
import { productoService } from '../services';
import {
  ProductoQueryParamsSchema,
  ProductoByIdParamsSchema,
  ProductoBySlugParamsSchema,
  ApiResponse,
} from '../types';
import { ZodError } from 'zod';

export class ProductoController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const params = ProductoQueryParamsSchema.parse(req.query) as Parameters<typeof productoService.getAll>[0];
      const productos = await productoService.getAll(params);

      const response: ApiResponse = {
        success: true,
        data: productos,
        message: 'Productos obtenidos exitosamente',
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
      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
        includeVariantes: req.query.includeVariantes,
      });

      const includeVariantes = req.query.includeVariantes === 'true';
      const producto = await productoService.getById(id, includeVariantes);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: producto,
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
      const params = ProductoBySlugParamsSchema.parse({
        slug: req.params.slug,
        empresaId: req.query.empresaId,
        includeVariantes: req.query.includeVariantes,
      });

      const includeVariantes = req.query.includeVariantes === 'true';
      const producto = await productoService.getBySlug(
        params.slug,
        params.empresaId,
        includeVariantes
      );

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: producto,
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

  async getVariantes(req: Request, res: Response, next: NextFunction) {
    try {
      const productoPadreId = parseInt(req.params.id);

      if (isNaN(productoPadreId)) {
        return res.status(400).json({
          success: false,
          error: 'ID de producto inválido',
        });
      }

      const variantes = await productoService.getVariantesByProductoPadreId(
        productoPadreId
      );

      const response: ApiResponse = {
        success: true,
        data: variantes,
        message: 'Variantes obtenidas exitosamente',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const productoController = new ProductoController();

