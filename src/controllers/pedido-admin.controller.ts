import { Request, Response } from 'express';
import { EstadoPedido } from '@prisma/client';
import type { ApiResponse } from '../types';
import {
  crearPedidoManualSchema,
  editarPedidoSchema,
  pedidoListQuerySchema,
  pedidoSyncService,
  resolverFallidoSchema,
} from '../services/pedido-sync.service';
import { pedidoPickupService } from '../services/pedido-pickup.service';
import { finalizeShippingAfterPaymentApproved } from '../services/checkout-shipping-finalize.service';
import { requiresPostalShipping } from '../utils/pedido-entrega.util';
import { resolvePedidoShippingTracking } from '../utils/pedido-shipping-tracking.util';
import { pedidoShippingLabelService } from '../services/pedido-shipping-label.service';
import { PedidoLabelNotAvailableError } from '../services/shipping/shipping.errors';
import { sfactoryService } from '../services/sfactory/sfactory.service';
import { aprobarOrdenPedidoEnSfactory } from '../services/sfactory/sfactory-orden-pedido.service';
import { pedidosService } from '../services/pedidos.service';
import { sfactoryCrearPedidoExternoBodySchema, toSfactoryPedidoExternoParams } from '../validation/sfactory-pedido-externo.schema';
import prisma from '../lib/prisma';
import { paramAsString } from '../utils/http-param.util';

function getEmpresaId(req: Request): number {
  const empresaId = Number((req as any).empresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('No se pudo obtener empresaId.');
  }
  return empresaId;
}

function parsePedidoId(req: Request): number {
  const id = parseInt(paramAsString(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('ID invalido');
  }
  return id;
}

export class PedidoAdminController {
  async listar(req: Request, res: Response) {
    try {
      const rawQuery =
        req.path.endsWith('/pendientes') || req.originalUrl.includes('/pendientes')
          ? { ...req.query, estado: EstadoPedido.pendiente_confirmacion }
          : req.query;
      const query = pedidoListQuerySchema.parse(rawQuery);
      const data = await pedidoSyncService.listar(getEmpresaId(req), query);
      const response: ApiResponse = {
        success: true,
        data,
        message: 'Pedidos',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        success: false,
        error: 'Error al listar pedidos',
        message,
      });
    }
  }

  async detalle(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const pedidoId = parsePedidoId(req);
      const data = await pedidoSyncService.detalle(empresaId, pedidoId);
      if (!data) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }
      const shippingLabel = await pedidoShippingLabelService.getAvailability(
        empresaId,
        pedidoId
      );
      res.json({ success: true, data: { ...data, shippingLabel } } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al leer pedido', message });
    }
  }

  async crearManual(req: Request, res: Response) {
    try {
      const body = crearPedidoManualSchema.parse(req.body);
      const data = await pedidoSyncService.crearManual(getEmpresaId(req), body);
      res.status(201).json({
        success: true,
        data,
        message: 'Pedido manual creado',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo crear el pedido', message });
    }
  }

  async editar(req: Request, res: Response) {
    try {
      const body = editarPedidoSchema.parse(req.body);
      const data = await pedidoSyncService.editarBorrador(
        getEmpresaId(req),
        parsePedidoId(req),
        body
      );
      res.json({ success: true, data, message: 'Pedido actualizado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo editar el pedido', message });
    }
  }

  async aprobar(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const id = parsePedidoId(req);
      const result = await pedidoSyncService.confirmar(empresaId, id);
      const updated = await pedidoSyncService.detalle(empresaId, id);

      if (!result.ok) {
        res.status(502).json({
          success: false,
          error: 'No se pudo confirmar el pedido en SFactory',
          message: result.message ?? 'Error al sincronizar con SFactory',
          data: { result, pedido: updated },
        } as ApiResponse);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { result, pedido: updated },
        message: result.alreadyProcessed
          ? 'El pedido ya habia sido procesado'
          : result.message ?? 'Pedido confirmado',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        success: false,
        error: 'No se pudo aprobar el pedido',
        message,
      });
    }
  }

  async rechazar(req: Request, res: Response) {
    try {
      const motivo =
        typeof req.body?.motivo === 'string' ? req.body.motivo : undefined;
      const data = await pedidoSyncService.cancelar(
        getEmpresaId(req),
        parsePedidoId(req),
        motivo
      );
      const response: ApiResponse = {
        success: true,
        data,
        message: 'Pedido cancelado',
      };
      res.json(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        success: false,
        error: 'No se pudo rechazar el pedido',
        message,
      });
    }
  }

  async reintentarSfactory(req: Request, res: Response) {
    try {
      const data = await pedidoSyncService.reintentarSfactory(
        getEmpresaId(req),
        parsePedidoId(req)
      );
      res.json({ success: true, data, message: 'Reintento SFactory ejecutado' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo reintentar SFactory', message });
    }
  }

  async resolverFallido(req: Request, res: Response) {
    try {
      const body = resolverFallidoSchema.parse(req.body ?? {});
      const data = await pedidoSyncService.resolverFallido(
        getEmpresaId(req),
        parsePedidoId(req),
        body
      );
      res.json({ success: true, data, message: 'Pedido fallido resuelto' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo resolver el pedido fallido', message });
    }
  }

  async syncSfactory(req: Request, res: Response) {
    try {
      const data = await pedidoSyncService.syncDesdeSfactory(
        getEmpresaId(req),
        parsePedidoId(req)
      );
      res.json({ success: true, data, message: 'Pedido sincronizado desde SFactory' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo sincronizar el pedido', message });
    }
  }

  async crearEnvioPostal(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const pedidoId = parsePedidoId(req);
      const pedido = await prisma.pedido.findFirst({
        where: { id: pedidoId, empresaId },
      });
      if (!pedido) {
        res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        return;
      }
      if (!requiresPostalShipping(pedido)) {
        res.status(400).json({
          success: false,
          error: 'Este pedido es retiro en tienda; no requiere envío postal.',
        });
        return;
      }
      const result = await finalizeShippingAfterPaymentApproved(pedidoId);
      const updated = await pedidoSyncService.detalle(empresaId, pedidoId);
      const tracking = updated ? resolvePedidoShippingTracking(updated) : null;

      if (!result.ok && !result.skipped) {
        res.status(502).json({
          success: false,
          error: 'No se pudo crear la orden en el carrier',
          message: result.error,
          data: { pedido: updated, tracking },
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: {
          result,
          pedido: updated,
          tracking,
        },
        message: tracking?.trackingNumber
          ? `Envío creado: ${tracking.trackingNumber}`
          : result.skipped
            ? 'El pedido ya tenía número de envío'
            : 'Orden de envío procesada',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({
        success: false,
        error: 'No se pudo generar el envío',
        message,
      });
    }
  }

  async getEtiquetaDisponibilidad(req: Request, res: Response) {
    try {
      const data = await pedidoShippingLabelService.getAvailability(
        getEmpresaId(req),
        parsePedidoId(req)
      );
      res.json({
        success: true,
        data,
        message: 'Disponibilidad de etiqueta',
      } as ApiResponse);
    } catch (error: unknown) {
      this.sendLabelError(res, error);
    }
  }

  async descargarEtiqueta(req: Request, res: Response) {
    try {
      const format =
        typeof req.query.format === 'string' && req.query.format.trim().toLowerCase() === 'json'
          ? 'json'
          : 'binary';
      const result = await pedidoShippingLabelService.downloadLabel(
        getEmpresaId(req),
        parsePedidoId(req)
      );

      if (format === 'json') {
        res.json({
          success: true,
          data: {
            trackingNumber: result.trackingNumber,
            fileName: result.fileName,
            fileBase64: result.buffer.toString('base64'),
          },
          message: 'Etiqueta',
        } as ApiResponse);
        return;
      }

      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.fileName.replace(/"/g, '')}"`
      );
      res.send(result.buffer);
    } catch (error: unknown) {
      this.sendLabelError(res, error);
    }
  }

  private sendLabelError(res: Response, error: unknown): void {
    if (error instanceof PedidoLabelNotAvailableError) {
      res.status(error.httpStatus).json({
        success: false,
        error: 'Etiqueta no disponible',
        message: error.message,
        reason: error.reason,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({
      success: false,
      error: 'No se pudo obtener la etiqueta',
      message,
    });
  }

  async enviarListoRetiro(req: Request, res: Response) {
    try {
      const data = await pedidoPickupService.enviarListoParaRetiro(
        getEmpresaId(req),
        parsePedidoId(req)
      );
      res.json({
        success: true,
        data,
        message: 'Aviso de retiro enviado al cliente',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo enviar el aviso de retiro', message });
    }
  }

  async marcarRetirado(req: Request, res: Response) {
    try {
      const sendEmail = req.body?.sendEmail !== false;
      const data = await pedidoPickupService.marcarPedidoRetirado(
        getEmpresaId(req),
        parsePedidoId(req),
        { sendEmail }
      );
      const msg = data.alreadyDelivered
        ? 'El pedido ya estaba marcado como entregado'
        : 'Pedido marcado como retirado';
      res.json({ success: true, data, message: msg } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo marcar como retirado', message });
    }
  }

  async syncActivosSfactory(req: Request, res: Response) {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const limit = limitRaw != null ? Number(limitRaw) : 50;
      const data = await pedidoSyncService.syncPedidosActivosDesdeSfactory(
        getEmpresaId(req),
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50
      );
      res.json({ success: true, data, message: 'Pedidos activos sincronizados desde SFactory' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudieron sincronizar pedidos activos', message });
    }
  }

  async syncStockSfactory(req: Request, res: Response) {
    try {
      const warehouseRaw = req.body?.warehouseId ?? req.query.warehouseId;
      const warehouseId = warehouseRaw != null && warehouseRaw !== '' ? Number(warehouseRaw) : undefined;
      const data = await pedidoSyncService.syncStockDesdeSfactory(
        getEmpresaId(req),
        warehouseId != null && Number.isFinite(warehouseId) ? warehouseId : undefined
      );
      res.json({ success: true, data, message: 'Stock sincronizado desde SFactory' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'No se pudo sincronizar stock', message });
    }
  }

  async listarSfactory(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyId: true, sfactoryCompanyKey: true },
      });

      const empresaIdSFactory = Number(req.query.empresa_id) || empresa?.sfactoryCompanyId || 1;
      const comercialId = Number(req.query.comercial_id) || 207;

      if (!empresaIdSFactory) {
        res.status(400).json({ success: false, error: 'La empresa no tiene empresa_id de SFactory configurado' });
        return;
      }

      const desde = typeof req.query.desde === 'string' ? req.query.desde : new Date().toISOString().slice(0, 10);
      const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : desde;
      const page = parseInt(String(req.query.page || '1'), 10);
      const limit = parseInt(String(req.query.limit || '50'), 10);

      const desdeAncho = '2025-01-01';
      const hastaAncho = '2026-12-31';

      const result = await pedidosService.listarDesdeSFactory({
        desde: desdeAncho,
        hasta: hastaAncho,
        empresa_id: empresaIdSFactory,
        comercial_id: comercialId,
      });

      console.log('[listarSfactory] result.data type:', typeof result.data, Array.isArray(result.data));

      let allItems: any[] = [];
      if (Array.isArray(result.data)) {
        allItems = result.data;
      } else if (result.data && typeof result.data === 'object' && 'data' in result.data) {
        const nested = (result.data as any).data;
        if (Array.isArray(nested)) {
          allItems = nested;
        }
      }

      console.log('[listarSfactory] allItems length:', allItems.length);
      if (!allItems.length) {
        console.log('[listarSfactory] result.data:', JSON.stringify(result.data, null, 2).slice(0, 500));
        throw new Error('No se pudieron obtener pedidos de la respuesta de SFactory');
      }
      const start = (page - 1) * limit;
      const paginatedItems = allItems.slice(start, start + limit);

      res.json({
        success: true,
        data: {
          data: paginatedItems,
          pagination: {
            page,
            limit,
            total: allItems.length,
            totalPages: Math.ceil(allItems.length / limit),
          },
        },
        message: 'Pedidos obtenidos desde SFactory',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al listar pedidos desde SFactory', message });
    }
  }

  async crearSfactory(req: Request, res: Response) {
    try {
      const parsed = sfactoryCrearPedidoExternoBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'Validación',
          message: 'Payload inválido para pedido externo',
          details: parsed.error.flatten(),
        });
        return;
      }

      const empresaId = getEmpresaId(req);
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyKey: true, sfactoryCompanyId: true },
      });
      if (!empresa?.sfactoryCompanyKey) {
        res.status(400).json({ success: false, error: 'La empresa no tiene companyKey de SFactory configurado' });
        return;
      }

      const params = toSfactoryPedidoExternoParams(parsed.data);
      const response = await sfactoryService.crearPedidoExterno(params, empresa.sfactoryCompanyKey);

      res.status(201).json({
        success: true,
        data: response,
        message: 'Pedido creado en SFactory',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al crear pedido en SFactory', message });
    }
  }

  async detalleSfactory(req: Request, res: Response) {
    try {
      const idParam = paramAsString(req.params.id);
      const ordenId = idParam ? parseInt(idParam, 10) : NaN;
      if (!Number.isFinite(ordenId) || ordenId <= 0) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
      }

      const empresaId = getEmpresaId(req);
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyKey: true },
      });
      if (!empresa?.sfactoryCompanyKey) {
        res.status(400).json({ success: false, error: 'La empresa no tiene companyKey de SFactory configurado' });
        return;
      }

      const data = await sfactoryService.leerOrdenPedido(ordenId, empresa.sfactoryCompanyKey);
      res.json({ success: true, data } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al obtener detalle del pedido', message });
    }
  }

  async cancelarSfactory(req: Request, res: Response) {
    try {
      const idParam = paramAsString(req.params.id);
      const ordenId = idParam ? parseInt(idParam, 10) : NaN;
      if (!Number.isFinite(ordenId) || ordenId <= 0) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
      }

      const empresaId = getEmpresaId(req);
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyKey: true },
      });
      if (!empresa?.sfactoryCompanyKey) {
        res.status(400).json({ success: false, error: 'La empresa no tiene companyKey de SFactory configurado' });
        return;
      }

      const data = await sfactoryService.cancelarOrdenPedido(ordenId, empresa.sfactoryCompanyKey);
      res.json({ success: true, data, message: 'Pedido cancelado en SFactory' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al cancelar pedido en SFactory', message });
    }
  }

  async aprobarSfactory(req: Request, res: Response) {
    try {
      const idParam = paramAsString(req.params.id);
      const ordenId = idParam ? parseInt(idParam, 10) : NaN;
      if (!Number.isFinite(ordenId) || ordenId <= 0) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
      }

      const empresaId = getEmpresaId(req);
      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyKey: true },
      });
      if (!empresa?.sfactoryCompanyKey) {
        res.status(400).json({ success: false, error: 'La empresa no tiene companyKey de SFactory configurado' });
        return;
      }

      const data = await aprobarOrdenPedidoEnSfactory(ordenId, empresa.sfactoryCompanyKey);
      res.json({
        success: true,
        data,
        message: data.skippedEdit
          ? 'La orden ya estaba aprobada en SFactory'
          : 'Pedido aprobado en SFactory',
      } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al aprobar pedido en SFactory', message });
    }
  }

  async buscarClientes(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      if (!search.trim()) {
        res.json({ success: true, data: [] } as ApiResponse);
        return;
      }

      const empresa = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { sfactoryCompanyKey: true },
      });
      if (!empresa?.sfactoryCompanyKey) {
        res.status(400).json({ success: false, error: 'La empresa no tiene companyKey de SFactory configurado' });
        return;
      }

      let data = await sfactoryService.buscarCliente(search, empresa.sfactoryCompanyKey);

      if (!data || data.length === 0) {
        const searchLower = search.toLowerCase();
        const searchNum = search.replace(/\D/g, '');
        const isCuit = searchNum.length === 11;
        const isEmail = search.includes('@');

        const whereClause: any = {
          empresaId,
          activo: true,
        };

        if (isCuit) {
          whereClause.cuit = searchNum;
        } else if (isEmail) {
          whereClause.email = { contains: search };
        } else {
          whereClause.OR = [
            { razonSocial: { contains: search } },
            { nombre: { contains: search } },
            { sfactoryCodigo: { contains: search } },
          ];
        }

        const localClients = await prisma.cliente.findMany({
          where: whereClause,
          take: 10,
        });
        data = localClients;
      }

      res.json({ success: true, data } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al buscar clientes', message });
    }
  }

  async buscarProductos(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const search = typeof req.query.search === 'string' ? req.query.search : '';

      if (!search.trim()) {
        res.json({ success: true, data: [] } as ApiResponse);
        return;
      }

      let data = await sfactoryService.buscarItems({ search, limit: 20 });

      if (!data || data.length === 0) {
        const localProducts = await prisma.productoWeb.findMany({
          where: {
            empresaId,
            activoSfactory: true,
            OR: [
              { sfactoryCodigo: { contains: search } },
              { nombre: { contains: search } },
            ],
          },
          take: 10,
          select: {
            sfactoryCodigo: true,
            nombre: true,
            precioCache: true,
            stockCache: true,
          },
        });
        data = localProducts.map(p => ({
          Codigo: p.sfactoryCodigo,
          Descripcion: p.nombre,
          PrecioVenta: p.precioCache,
          Stock: p.stockCache,
        }));
      }

      res.json({ success: true, data } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error al buscar productos', message });
    }
  }
}

export const pedidoAdminController = new PedidoAdminController();
