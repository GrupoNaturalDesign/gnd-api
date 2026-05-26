import { Response } from 'express';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import type { ApiResponse } from '../types';
import {
  cuentaPedidoIdParamsSchema,
  cuentaPedidosListQuerySchema,
} from '../validation/cuenta-pedidos.validation';
import {
  cuentaPedidosService,
  resolveUsuarioIdByFirebaseUid,
} from '../services/cuenta-pedidos.service';

export class CuentaPedidosController {
  private async getUsuarioId(req: FirebaseAuthRequest, res: Response): Promise<number | null> {
    const uid = req.uid;
    if (!uid) {
      res.status(401).json({ success: false, error: 'No autenticado.' });
      return null;
    }
    const usuarioId = await resolveUsuarioIdByFirebaseUid(uid);
    if (!usuarioId) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado en la base local.',
      });
      return null;
    }
    return usuarioId;
  }

  async listar(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const parsed = cuentaPedidosListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Parámetros inválidos',
        details: parsed.error.flatten(),
      });
      return;
    }

    const usuarioId = await this.getUsuarioId(req, res);
    if (usuarioId == null) return;

    try {
      const resultado = await cuentaPedidosService.listar(usuarioId, parsed.data);
      const response: ApiResponse = {
        success: true,
        data: resultado.data,
        message: 'Pedidos obtenidos',
      };
      res.json({
        ...response,
        pagination: resultado.pagination,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      res.status(500).json({
        success: false,
        error: 'Error al listar pedidos',
        message,
      });
    }
  }

  async detalle(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const parsed = cuentaPedidoIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'ID inválido',
        details: parsed.error.flatten(),
      });
      return;
    }

    const usuarioId = await this.getUsuarioId(req, res);
    if (usuarioId == null) return;

    try {
      const pedido = await cuentaPedidosService.detalle(usuarioId, parsed.data.id);
      if (!pedido) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }
      const response: ApiResponse = {
        success: true,
        data: pedido,
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      res.status(500).json({
        success: false,
        error: 'Error al obtener pedido',
        message,
      });
    }
  }

  async abandonarCheckout(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const parsed = cuentaPedidoIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'ID inválido',
        details: parsed.error.flatten(),
      });
      return;
    }

    const usuarioId = await this.getUsuarioId(req, res);
    if (usuarioId == null) return;

    try {
      const pedido = await cuentaPedidosService.abandonarCheckout(usuarioId, parsed.data.id);
      if (!pedido) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }
      const response: ApiResponse = {
        success: true,
        data: pedido,
        message: 'Checkout abandonado',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      const isBusiness =
        message.includes('pendiente de pago') ||
        message.includes('Mercado Pago') ||
        message.includes('acreditado') ||
        message.includes('S-Factory');
      res.status(isBusiness ? 409 : 500).json({
        success: false,
        error: isBusiness ? message : 'Error al abandonar checkout',
        message,
      });
    }
  }
}

export const cuentaPedidosController = new CuentaPedidosController();
