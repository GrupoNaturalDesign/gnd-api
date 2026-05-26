import { Request, Response, NextFunction } from 'express';
import { rubroSyncService } from '../services/sync/rubro-sync.service';
import { productoSyncService } from '../services/sync/producto-sync.service';
import { stockPreciosSyncService } from '../services/sync/stock-precios-sync.service';
import {
  tryAcquireSyncProductosLock,
  releaseSyncProductosLock,
  setSyncProductosLastRun,
  checkSyncProductosCooldown,
} from '../services/sync/sync-productos-guard.service';
import { ApiResponse } from '../types';

export class SyncController {
  async syncRubros(req: Request, res: Response, next: NextFunction) {
    try {
      // El middleware garantiza que empresaId existe, si no, ya devolvió error
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'EmpresaId requerido',
          message: 'No se pudo obtener el empresaId del request',
        });
      }

      const resultado = await rubroSyncService.syncRubros(empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: 'Rubros sincronizados exitosamente',
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar rubros',
        message: error.message,
      });
    }
  }

  async syncSubrubros(req: Request, res: Response, next: NextFunction) {
    try {
      // El middleware garantiza que empresaId existe, si no, ya devolvió error
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'EmpresaId requerido',
          message: 'No se pudo obtener el empresaId del request',
        });
      }

      const resultado = await rubroSyncService.syncSubrubros(empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: 'Subrubros sincronizados exitosamente',
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar subrubros',
        message: error.message,
      });
    }
  }

  async syncProductos(req: Request, res: Response, next: NextFunction) {
    const empresaId = (req as any).empresaId;
    if (!empresaId) {
      return res.status(400).json({
        success: false,
        error: 'EmpresaId requerido',
        message: 'No se pudo obtener el empresaId del request',
      });
    }

    const acquired = await tryAcquireSyncProductosLock(empresaId);
    if (!acquired) {
      return res.status(429).json({
        success: false,
        error: 'Sync en curso',
        message: 'Ya hay una sincronización de productos en curso. Espere a que finalice.',
      });
    }

    const cooldown = await checkSyncProductosCooldown(empresaId);
    if (!cooldown.allowed) {
      await releaseSyncProductosLock(empresaId);
      const retryAfter = cooldown.retryAfterSeconds ?? 60;
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'Cooldown',
        message: cooldown.error,
        retryAfterSeconds: retryAfter,
      });
    }

    try {
      const resultado = await productoSyncService.syncProductos(empresaId);
      await setSyncProductosLastRun(empresaId);

      let stockPrecios: Awaited<
        ReturnType<typeof stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce>
      > | null = null;
      if (process.env.SYNC_STOCK_AFTER_PRODUCTOS === 'true') {
        try {
          stockPrecios = await stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce(
            empresaId
          );
        } catch (err: unknown) {
          console.error('[syncProductos] SYNC_STOCK_AFTER_PRODUCTOS falló:', err);
        }
      }

      const response: ApiResponse = {
        success: true,
        data: stockPrecios ? { ...resultado, stockPrecios } : resultado,
        message: stockPrecios
          ? 'Productos sincronizados y stock/precios actualizados desde depósito ecommerce'
          : 'Productos sincronizados exitosamente',
      };
      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar productos',
        message: error.message,
      });
    } finally {
      await releaseSyncProductosLock(empresaId);
    }
  }

  /**
   * POST /api/sync/stock-precios
   * Stock y precios desde S-Factory (depósito ECOMMERCE) solo para variantes WORKWEAR/OFFICE.
   */
  async syncStockPrecios(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'EmpresaId requerido',
          message: 'No se pudo obtener el empresaId del request',
        });
      }

      const rawWh = req.body?.warehouseId;
      const warehouseIdParsed =
        rawWh !== undefined && rawWh !== null && rawWh !== ''
          ? Number(rawWh)
          : undefined;
      const warehouseId =
        warehouseIdParsed !== undefined && !Number.isNaN(warehouseIdParsed)
          ? warehouseIdParsed
          : undefined;

      const data = await stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce(
        empresaId,
        warehouseId
      );

      const omitMsg =
        data.codigosOmitidos.length > 0
          ? ` · ${data.codigosOmitidos.length} código(s) omitido(s) (no existen en S-Factory)`
          : '';
      const skipMsg =
        data.variantesOmitidas > 0
          ? ` · ${data.variantesOmitidas} sin cambios`
          : '';

      const response: ApiResponse = {
        success: true,
        data,
        message:
          'Stock y precios actualizados desde S-Factory (depósito ecommerce)' +
          skipMsg +
          omitMsg,
      };
      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar stock y precios',
        message: error.message,
      });
    }
  }

  async syncAll(req: Request, res: Response, next: NextFunction) {
    const empresaId = (req as any).empresaId;
    if (!empresaId) {
      return res.status(400).json({
        success: false,
        error: 'EmpresaId requerido',
        message: 'No se pudo obtener el empresaId del request',
      });
    }

    const acquired = await tryAcquireSyncProductosLock(empresaId);
    if (!acquired) {
      return res.status(429).json({
        success: false,
        error: 'Sync en curso',
        message: 'Ya hay una sincronización de productos en curso. Espere a que finalice.',
      });
    }

    const cooldown = await checkSyncProductosCooldown(empresaId);
    if (!cooldown.allowed) {
      await releaseSyncProductosLock(empresaId);
      const retryAfter = cooldown.retryAfterSeconds ?? 60;
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'Cooldown',
        message: cooldown.error,
        retryAfterSeconds: retryAfter,
      });
    }

    try {
      const rubros = await rubroSyncService.syncRubros(empresaId);
      const subrubros = await rubroSyncService.syncSubrubros(empresaId);
      const productos = await productoSyncService.syncProductos(empresaId);
      await setSyncProductosLastRun(empresaId);

      let stockPrecios: Awaited<
        ReturnType<typeof stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce>
      > | null = null;
      if (process.env.SYNC_STOCK_AFTER_PRODUCTOS === 'true') {
        try {
          stockPrecios = await stockPreciosSyncService.syncStockPreciosPorDepositoEcommerce(
            empresaId
          );
        } catch (err: unknown) {
          console.error('[syncAll] SYNC_STOCK_AFTER_PRODUCTOS falló:', err);
        }
      }

      const response: ApiResponse = {
        success: true,
        data: {
          rubros,
          subrubros,
          productos,
          ...(stockPrecios ? { stockPrecios } : {}),
        },
        message: stockPrecios
          ? 'Sincronización completa (incl. stock depósito ecommerce)'
          : 'Sincronización completa exitosa',
      };
      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar datos',
        message: error.message,
      });
    } finally {
      await releaseSyncProductosLock(empresaId);
    }
  }
}

export const syncController = new SyncController();
