import { Response, NextFunction } from 'express';
import prismaDefault from '../lib/prisma';
import {
  CuponEngineService,
  CuponEvaluacionParams,
  CarritoItem,
} from '../services/cupon-engine.service';
import type { ApiResponse } from '../types';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import type { PrismaClient } from '@prisma/client';

interface ValidarCuponBodyItem {
  productoWebId?: number;
  productoPadreId?: number;
  cantidad: number;
  precioUnitario: number;
  rubroId?: number;
  subrubroId?: number;
}

interface ValidarCuponBody {
  codigo?: string;
  items?: ValidarCuponBodyItem[];
  subtotal?: number;
  formaPago?: string;
}

function mapItemsToCarrito(items: ValidarCuponBodyItem[]): CarritoItem[] {
  return items.map((item) => ({
    productoId: item.productoWebId ?? item.productoPadreId ?? 0,
    productoWebId: item.productoWebId,
    productoPadreId: item.productoPadreId,
    rubroId: item.rubroId,
    subrubroId: item.subrubroId,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
  }));
}

function calcularSubtotal(items: CarritoItem[]): number {
  return items.reduce((sum, i) => sum + i.precioUnitario * i.cantidad, 0);
}

export class CuponController {
  private prisma: PrismaClient;
  private cuponEngine: CuponEngineService;

  constructor(
    prisma?: PrismaClient,
    cuponEngine?: CuponEngineService
  ) {
    this.prisma = prisma ?? prismaDefault;
    this.cuponEngine = cuponEngine ?? new CuponEngineService();
  }

  async validar(req: FirebaseAuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as { empresaId?: number }).empresaId;
      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Empresa no especificada',
        });
      }

      const uid = req.uid;
      if (!uid) {
        return res.status(401).json({ success: false, error: 'No autenticado.' });
      }

      const usuario = await this.prisma.usuario.findFirst({
        where: { externalId: uid },
        select: { id: true, cliente: { select: { id: true } } },
      });
      if (!usuario) {
        return res.status(404).json({
          success: false,
          error: 'Usuario no encontrado en la base local.',
        });
      }

      const body = req.body as ValidarCuponBody;
      const { codigo, items: rawItems } = body;

      if (!codigo?.trim() || !Array.isArray(rawItems) || rawItems.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Faltan parámetros requeridos: codigo, items',
        });
      }

      const items = mapItemsToCarrito(rawItems);
      const subtotal =
        typeof body.subtotal === 'number' && body.subtotal > 0
          ? body.subtotal
          : calcularSubtotal(items);

      const params: CuponEvaluacionParams = {
        empresaId,
        codigo: codigo.trim(),
        usuarioId: usuario.id,
        clienteId: usuario.cliente?.id,
        items,
        subtotal,
      };

      const resultado = await this.cuponEngine.validarCupon(params);

      if (!resultado.valido || !resultado.detalle) {
        const response: ApiResponse = {
          success: true,
          data: {
            aplicable: false,
            descuentoTotal: 0,
            mensaje: resultado.error ?? 'Cupón no aplicable',
          },
        };
        return res.status(200).json(response);
      }

      const detalle = resultado.detalle;
      const response: ApiResponse = {
        success: true,
        data: {
          aplicable: true,
          descuentoTotal: detalle.descuentoTotal,
          cupon: {
            id: detalle.cuponId,
            codigo: detalle.codigo,
            nombre: detalle.nombre,
            tipoDescuento: detalle.tipoDescuento,
            valorDescuento: detalle.valorDescuento,
            alcance: detalle.alcance,
          },
        },
        message: 'Cupón válido',
      };

      return res.status(200).json(response);
    } catch (error: unknown) {
      console.error('[CuponController.validar] Error:', error);
      next(error);
    }
  }
}
