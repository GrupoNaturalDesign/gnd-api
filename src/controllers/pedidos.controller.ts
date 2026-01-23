import { Request, Response, NextFunction } from 'express';
import { pedidosService } from '../services/pedidos.service';
import type { ApiResponse } from '../types';

export class PedidosController {
  /**
   * GET /api/pedidos
   * Lista pedidos directamente desde SFactory (sin guardar en BD)
   * Útil para ver la estructura de datos
   */
  async listar(req: Request, res: Response, next: NextFunction) {
    try {
      const parameters = req.query || {};

      const resultado = await pedidosService.listarDesdeSFactory(parameters);

      res.json(resultado);
    } catch (error: any) {
      console.error('[PedidosController.listar] Error completo:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al listar pedidos desde SFactory',
        message: error.message || 'Error desconocido',
      });
    }
  }
}

export const pedidosController = new PedidosController();

