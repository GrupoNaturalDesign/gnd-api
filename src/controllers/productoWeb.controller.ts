import { Request, Response, NextFunction } from 'express';
import { productoWebService, BULK_VARIANTES_FORBIDDEN_MESSAGE } from '../services/productoWeb.service';
import { CacheService } from '../services/cache.service';
import { handleZodError } from '../utils/validation';
import { z } from 'zod';
import type { ApiResponse } from '../types';

const UpdateProductoWebSchema = z.object({
  stockCache: z.coerce.number().nullable().optional(),
  precioCache: z.coerce.number().nullable().optional(),
});

const BulkUpdateProductoWebSchema = z.object({
  updates: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      stockCache: z.coerce.number().nullable().optional(),
      precioCache: z.coerce.number().nullable().optional(),
    })
  ),
});

const GetProductoWebByIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export class ProductoWebController {
  /**
   * PATCH /api/productos-web/:id
   * Actualiza un ProductoWeb
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoWebByIdSchema.parse({
        id: req.params.id,
      });

      const body = UpdateProductoWebSchema.parse(req.body);

      const empresaId = (req as any).empresaId;
      const productoWeb = await productoWebService.update(params.id, body);

      // Invalidar cache del producto padre
      if (productoWeb.productoPadreId) {
        await CacheService.invalidateProducts(empresaId, productoWeb.productoPadreId);
      }

      const response: ApiResponse = {
        success: true,
        data: productoWeb,
        message: 'ProductoWeb actualizado exitosamente',
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * PATCH /api/productos-web/bulk
   * Actualiza múltiples ProductoWeb en lote. Valida que todas las variantes pertenezcan a la empresa.
   */
  async updateBulk(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Empresa no definida',
          message: 'Se requiere empresaId (middleware empresa).',
        });
      }

      const body = BulkUpdateProductoWebSchema.parse(req.body);

      const productosWeb = await productoWebService.updateBulk(body.updates, empresaId);

      const productoPadreIds = new Set<number>();
      for (const productoWeb of productosWeb) {
        if (productoWeb.productoPadreId) {
          productoPadreIds.add(productoWeb.productoPadreId);
        }
      }

      for (const productoPadreId of productoPadreIds) {
        await CacheService.invalidateProducts(empresaId, productoPadreId);
      }
      if (empresaId) {
        await CacheService.invalidateProducts(empresaId);
      }

      const response: ApiResponse = {
        success: true,
        data: productosWeb,
        message: `${productosWeb.length} variante(s) actualizada(s) exitosamente`,
      };

      res.json(response);
    } catch (error: any) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      if (error?.message === BULK_VARIANTES_FORBIDDEN_MESSAGE) {
        return res.status(403).json({
          success: false,
          error: 'Acceso denegado',
          message: 'Una o más variantes no pertenecen a la empresa o no pueden actualizarse en el mismo lote.',
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/productos-web/:id
   * Obtiene un ProductoWeb por ID
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoWebByIdSchema.parse({
        id: req.params.id,
      });

      const productoWeb = await productoWebService.getById(params.id);

      if (!productoWeb) {
        return res.status(404).json({
          success: false,
          message: 'ProductoWeb no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: productoWeb,
        message: 'ProductoWeb obtenido exitosamente',
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }
}

export const productoWebController = new ProductoWebController();

