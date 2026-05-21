// src/controllers/sfactory-ventas.controller.ts
import { Request, Response } from 'express';
import { sfactoryService } from '../services/sfactory/sfactory.service';
import type { ApiResponse } from '../types';
import type {
  SFactoryListarOrdenPedidoParams,
  SFactoryCrearOrdenPedidoParams,
  SFactoryEditarOrdenPedidoParams,
} from '../types/sfactory.types';
import {
  sfactoryCrearPedidoExternoBodySchema,
  toSfactoryPedidoExternoParams,
} from '../validation/sfactory-pedido-externo.schema';

function companyKeyFromReq(req: Request): string | undefined {
  const q = req.query.companyKey;
  const b = (req.body as { companyKey?: string })?.companyKey;
  if (typeof q === 'string' && q.trim()) return q.trim();
  if (typeof b === 'string' && b.trim()) return b.trim();
  return undefined;
}

export class SFactoryVentasController {
  async listar(req: Request, res: Response) {
    try {
      const body = req.body as Partial<SFactoryListarOrdenPedidoParams>;
      if (
        !body.desde ||
        !body.hasta ||
        body.comercial_id == null ||
        body.empresa_id == null
      ) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          message: 'Se requieren desde, hasta, comercial_id y empresa_id',
        });
      }
      const data = await sfactoryService.listarOrdenesPedido(
        body as SFactoryListarOrdenPedidoParams,
        companyKeyFromReq(req)
      );
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al listar órdenes de pedido en SFactory',
        message,
      });
    }
  }

  async crear(req: Request, res: Response) {
    try {
      const body = req.body as Partial<SFactoryCrearOrdenPedidoParams>;
      if (!body.data || !Array.isArray(body.items)) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          message: 'Se requieren data e items',
        });
      }
      const data = await sfactoryService.crearOrdenPedido(
        body as SFactoryCrearOrdenPedidoParams,
        companyKeyFromReq(req)
      );
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al crear orden de pedido en SFactory',
        message,
      });
    }
  }

  /**
   * POST /pedido-externo — ventas_crear_pedido_externo (validado con Zod).
   * Requiere admin + mismo stack que el resto de /sfactory/ventas.
   */
  async crearPedidoExterno(req: Request, res: Response) {
    const parsed = sfactoryCrearPedidoExternoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validación',
        message: 'Payload inválido para pedido externo',
        details: parsed.error.flatten(),
      });
    }
    try {
      const params = toSfactoryPedidoExternoParams(parsed.data);
      const data = await sfactoryService.crearPedidoExterno(
        params,
        companyKeyFromReq(req) ?? ''
      );
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al crear pedido externo en SFactory',
        message,
      });
    }
  }

  async editar(req: Request, res: Response) {
    try {
      const body = req.body as Partial<SFactoryEditarOrdenPedidoParams>;
      if (!body.data || !Array.isArray(body.items)) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          message: 'Se requieren data e items',
        });
      }
      const data = await sfactoryService.editarOrdenPedido(
        body as SFactoryEditarOrdenPedidoParams,
        companyKeyFromReq(req)
      );
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al editar orden de pedido en SFactory',
        message,
      });
    }
  }

  async leer(req: Request, res: Response) {
    try {
      const raw = req.params.orderId;
      const orderId = Number(raw);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros inválidos',
          message: 'orderId debe ser un número positivo',
        });
      }
      const data = await sfactoryService.leerOrdenPedido(orderId, companyKeyFromReq(req));
      const response: ApiResponse = { success: true, data };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: 'Error al leer orden de pedido en SFactory',
        message,
      });
    }
  }
}

export const sfactoryVentasController = new SFactoryVentasController();
