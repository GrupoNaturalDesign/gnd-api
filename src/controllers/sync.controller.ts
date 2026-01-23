import { Request, Response, NextFunction } from 'express';
import { rubroSyncService } from '../services/sync/rubro-sync.service';
import { productoSyncService } from '../services/sync/producto-sync.service';
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

      const resultado = await productoSyncService.syncProductos(empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: 'Productos sincronizados exitosamente',
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar productos',
        message: error.message,
      });
    }
  }

  async syncAll(req: Request, res: Response, next: NextFunction) {
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

      const rubros = await rubroSyncService.syncRubros(empresaId);
      const subrubros = await rubroSyncService.syncSubrubros(empresaId);
      const productos = await productoSyncService.syncProductos(empresaId);

      const response: ApiResponse = {
        success: true,
        data: {
          rubros,
          subrubros,
          productos,
        },
        message: 'Sincronización completa exitosa',
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Error al sincronizar datos',
        message: error.message,
      });
    }
  }
}

export const syncController = new SyncController();
