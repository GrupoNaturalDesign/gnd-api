import { Request, Response } from 'express';
import { pedidoListQuerySchema, pedidoSyncService } from '../services/pedido-sync.service';
import type { ApiResponse } from '../types';

export class PedidosController {
  async listar(req: Request, res: Response) {
    try {
      const empresaId = Number((req as any).empresaId);
      if (!Number.isFinite(empresaId) || empresaId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Empresa no encontrada',
          message: 'No se pudo obtener empresaId.',
        });
        return;
      }

      const query = pedidoListQuerySchema.parse(req.query);
      const resultado = await pedidoSyncService.listar(empresaId, query);
      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: 'Pedidos locales sincronizables',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({
        success: false,
        error: 'Error al listar pedidos',
        message,
      });
    }
  }
}

export const pedidosController = new PedidosController();
