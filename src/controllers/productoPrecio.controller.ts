import { Request, Response, NextFunction } from 'express';
import { productoPrecioService } from '../services/productoPrecio.service';
import { handleZodError } from '../utils/validation';
import { z } from 'zod';
import type { ApiResponse } from '../types';

const CreateProductoPrecioSchema = z.object({
  productoWebId: z.coerce.number().int().positive(),
  tipoCliente: z.enum(['minorista', 'mayorista']),
  precioLista: z.coerce.number().positive(),
  minimoUnidades: z.coerce.number().nullable().optional(),
  cuotasFinanciado: z.coerce.number().int().positive().optional(),
});

const UpdateProductoPrecioSchema = z.object({
  precioLista: z.coerce.number().positive().optional(),
  minimoUnidades: z.coerce.number().nullable().optional(),
  cuotasFinanciado: z.coerce.number().int().positive().optional(),
});

const GetProductoPrecioByIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const GetProductoPrecioByProductoWebIdSchema = z.object({
  productoWebId: z.coerce.number().int().positive(),
});

const GetProductoPrecioByProductoWebIdAndTipoSchema = z.object({
  productoWebId: z.coerce.number().int().positive(),
  tipoCliente: z.enum(['minorista', 'mayorista']),
});

export class ProductoPrecioController {
  /**
   * POST /api/productos-precios
   * Crea o actualiza un precio
   */
  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const body = CreateProductoPrecioSchema.parse(req.body);
      const precio = await productoPrecioService.upsert(body);

      const response: ApiResponse = {
        success: true,
        data: precio,
        message: 'Precio guardado exitosamente',
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
   * PATCH /api/productos-precios/:id
   * Actualiza un precio
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoPrecioByIdSchema.parse({
        id: req.params.id,
      });
      const body = UpdateProductoPrecioSchema.parse(req.body);

      const precio = await productoPrecioService.update(params.id, body);

      const response: ApiResponse = {
        success: true,
        data: precio,
        message: 'Precio actualizado exitosamente',
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
   * GET /api/productos-precios/producto-web/:productoWebId
   * Obtiene precios por productoWebId
   */
  async getByProductoWebId(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoPrecioByProductoWebIdSchema.parse({
        productoWebId: req.params.productoWebId,
      });

      const precios = await productoPrecioService.getByProductoWebId(params.productoWebId);

      const response: ApiResponse = {
        success: true,
        data: precios,
        message: 'Precios obtenidos exitosamente',
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
   * GET /api/productos-precios/producto-web/:productoWebId/tipo/:tipoCliente
   * Obtiene precio por productoWebId y tipoCliente
   */
  async getByProductoWebIdAndTipo(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoPrecioByProductoWebIdAndTipoSchema.parse({
        productoWebId: req.params.productoWebId,
        tipoCliente: req.params.tipoCliente as 'minorista' | 'mayorista',
      });

      const precio = await productoPrecioService.getByProductoWebIdAndTipo(
        params.productoWebId,
        params.tipoCliente
      );

      if (!precio) {
        return res.status(404).json({
          success: false,
          message: 'Precio no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: precio,
        message: 'Precio obtenido exitosamente',
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
   * DELETE /api/productos-precios/:id
   * Elimina un precio
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const params = GetProductoPrecioByIdSchema.parse({
        id: req.params.id,
      });

      await productoPrecioService.delete(params.id);

      const response: ApiResponse = {
        success: true,
        message: 'Precio eliminado exitosamente',
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

export const productoPrecioController = new ProductoPrecioController();

