import { Request, Response, NextFunction } from 'express';
import { productoWebService, BULK_VARIANTES_FORBIDDEN_MESSAGE } from '../services/productoWeb.service';
import { CacheService } from '../services/cache.service';
import { handleZodError } from '../utils/validation';
import { z } from 'zod';
import type { ApiResponse } from '../types';
import { logAudit } from '../services/audit.service';
import prisma from '../lib/prisma';

/** Serializa Decimal/number a número para JSON de auditoría */
function auditNum(v: unknown): number | null {
  if (v == null) return null;
  if (
    typeof v === 'object' &&
    v !== null &&
    'toNumber' in v &&
    typeof (v as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
      const prev = await productoWebService.getById(params.id);
      if (!prev) {
        return res.status(404).json({
          success: false,
          message: 'ProductoWeb no encontrado',
        });
      }

      const productoWeb = await productoWebService.update(params.id, body);

      await logAudit({
        entity: 'producto_web',
        entityId: String(params.id),
        action: 'UPDATE',
        oldValues: {
          origen: 'cache_precio_stock_local',
          productoPadreId: prev.productoPadreId,
          sku: prev.sfactoryCodigo,
          stockCache: auditNum(prev.stockCache),
          precioCache: auditNum(prev.precioCache),
        },
        newValues: {
          origen: 'cache_precio_stock_local',
          productoPadreId: productoWeb.productoPadreId,
          sku: productoWeb.sfactoryCodigo,
          stockCache: auditNum(productoWeb.stockCache),
          precioCache: auditNum(productoWeb.precioCache),
        },
        empresaId: empresaId ?? (prev.productoPadre as { empresaId?: number } | null)?.empresaId ?? undefined,
        userId: (req as any).userId,
        userEmail: (req as any).userEmail,
        ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
        userAgent: (req as any).get?.('user-agent'),
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.path,
      });
      (req as any).auditLogged = true;

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

      const ids = [...new Set(body.updates.map((u) => u.id))];
      const antes =
        ids.length > 0
          ? await prisma.productoWeb.findMany({
              where: { id: { in: ids } },
              select: {
                id: true,
                sfactoryCodigo: true,
                stockCache: true,
                precioCache: true,
                productoPadreId: true,
              },
            })
          : [];

      const antesMap = new Map(antes.map((a) => [a.id, a]));

      const productosWeb = await productoWebService.updateBulk(body.updates, empresaId);

      const productoPadreId = antes[0]?.productoPadreId;
      if (productoPadreId != null && antes.length > 0 && productosWeb.length > 0) {
        const despuesMap = new Map(productosWeb.map((p) => [p.id, p]));

        const variantesAntes = body.updates
          .map((u) => {
            const row = antesMap.get(u.id);
            if (!row) return null;
            return {
              id: row.id,
              sku: row.sfactoryCodigo,
              stockCache: auditNum(row.stockCache),
              precioCache: auditNum(row.precioCache),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null);

        const variantesDespues = body.updates
          .map((u) => {
            const p = despuesMap.get(u.id);
            if (!p) return null;
            return {
              id: p.id,
              sku: p.sfactoryCodigo,
              stockCache: auditNum(p.stockCache),
              precioCache: auditNum(p.precioCache),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null);

        await logAudit({
          entity: 'producto_padre',
          entityId: String(productoPadreId),
          action: 'UPDATE',
          oldValues: {
            origen: 'cache_precio_stock_local',
            alcance: 'variantes_seleccionadas',
            cantidadVariantes: variantesAntes.length,
            variantes: variantesAntes,
          },
          newValues: {
            origen: 'cache_precio_stock_local',
            alcance: 'variantes_seleccionadas',
            cantidadVariantes: variantesDespues.length,
            variantes: variantesDespues,
          },
          empresaId,
          userId: (req as any).userId,
          userEmail: (req as any).userEmail,
          ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
          userAgent: (req as any).get?.('user-agent'),
          method: req.method,
          path: req.originalUrl?.split('?')[0] ?? req.path,
        });
      }
      (req as any).auditLogged = true;

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

