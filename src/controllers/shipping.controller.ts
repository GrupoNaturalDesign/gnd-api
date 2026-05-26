import { Response } from 'express';
import { z } from 'zod';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import prisma from '../lib/prisma';
import { shippingService } from '../services/shipping/shipping.service';
import type { ApiResponse } from '../types';
import {
  ShippingConfigError,
  ShippingHttpError,
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from '../services/shipping/shipping.errors';
import { shippingTrackingQuerySchema } from '../validation/shipping-tracking.validation';
import { paramAsString } from '../utils/http-param.util';
import { buildShippingTrackingUrl } from '../utils/shipping-tracking-url.util';

const recipientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const addressSchema = z.object({
  streetName: z.string().min(1),
  streetNumber: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  floor: z.string().optional(),
  department: z.string().optional(),
});

const parcelSchema = z.object({
  weightGrams: z.number().positive(),
  height: z.number().positive(),
  width: z.number().positive(),
  depth: z.number().positive(),
  declaredValue: z.number().nonnegative(),
});

const createOrderBodySchema = z.object({
  pedidoId: z.coerce.number().int().positive(),
  provider: z.enum(['correo', 'andreani']).optional(),
  deliveryType: z.enum(['homeDelivery', 'agency']),
  agencyId: z.string().optional(),
  recipient: recipientSchema,
  address: addressSchema.optional(),
  parcel: parcelSchema,
});

const quoteBodySchema = z.object({
  cpDestino: z.string().min(2),
  deliveryType: z.enum(['homeDelivery', 'agency']),
  parcel: parcelSchema,
  provider: z.enum(['andreani']).optional(),
});

function boolQuery(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return undefined;
}

export class ShippingController {
  async createOrder(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;
    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }
    const parsed = createOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Body inválido',
        details: parsed.error.flatten(),
      });
      return;
    }
    const body = parsed.data;
    try {
      const defaultProv = await shippingService.resolveDefaultProvider(empresaId);
      const provider = body.provider ?? defaultProv;
      const result = await shippingService.createOrder({
        pedidoId: body.pedidoId,
        empresaId,
        provider,
        deliveryType: body.deliveryType,
        agencyId: body.agencyId,
        recipient: body.recipient,
        address: body.address,
        parcel: body.parcel,
      });
      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Orden de envío creada',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  async quote(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;
    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }
    const parsed = quoteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Body inválido',
        details: parsed.error.flatten(),
      });
      return;
    }
    try {
      const data = await shippingService.quoteAndreani({
        empresaId,
        cpDestino: parsed.data.cpDestino,
        deliveryType: parsed.data.deliveryType,
        parcel: parsed.data.parcel,
        provider: parsed.data.provider,
      });
      const response: ApiResponse = {
        success: true,
        data,
        message: 'Cotización Andreani',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  async getOrderLabel(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;
    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }
    const pedidoId = parseInt(paramAsString(req.params.pedidoId), 10);
    if (!Number.isFinite(pedidoId)) {
      res.status(400).json({ success: false, error: 'pedidoId inválido' });
      return;
    }
    const q = req.query;
    const defaultProv = await shippingService.resolveDefaultProvider(empresaId);
    const providerRaw = typeof q.provider === 'string' ? q.provider : undefined;
    const provider =
      providerRaw === 'correo' || providerRaw === 'andreani'
        ? providerRaw
        : defaultProv;
    const trackingNumber =
      typeof q.trackingNumber === 'string' && q.trackingNumber.trim()
        ? q.trackingNumber.trim()
        : undefined;
    try {
      let tn = trackingNumber;
      if (!tn) {
        const pedido = await prisma.pedido.findFirst({
          where: { id: pedidoId, empresaId },
          select: {
            andreaniNumeroEnvio: true,
            correoTrackingNumber: true,
          },
        });
        tn =
          provider === 'andreani'
            ? pedido?.andreaniNumeroEnvio ?? undefined
            : pedido?.correoTrackingNumber ?? undefined;
      }
      if (!tn) {
        res.status(400).json({
          success: false,
          error: 'Falta trackingNumber en query o en el pedido',
        });
        return;
      }
      const label = await shippingService.getLabel(
        pedidoId,
        tn,
        provider,
        empresaId
      );
      const response: ApiResponse = {
        success: true,
        data: label,
        message: 'Etiqueta',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  async getOrderTracking(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;
    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }
    const pedidoId = parseInt(paramAsString(req.params.pedidoId), 10);
    if (!Number.isFinite(pedidoId)) {
      res.status(400).json({ success: false, error: 'pedidoId inválido' });
      return;
    }
    const q = req.query;
    const defaultProv = await shippingService.resolveDefaultProvider(empresaId);
    const providerRaw = typeof q.provider === 'string' ? q.provider : undefined;
    const provider =
      providerRaw === 'correo' || providerRaw === 'andreani'
        ? providerRaw
        : defaultProv;
    const numbersRaw = typeof q.numbers === 'string' ? q.numbers : '';
    const numbers = numbersRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      let list = numbers;
      if (list.length === 0) {
        const pedido = await prisma.pedido.findFirst({
          where: { id: pedidoId, empresaId },
          select: {
            andreaniNumeroEnvio: true,
            correoTrackingNumber: true,
          },
        });
        const tn =
          provider === 'andreani'
            ? pedido?.andreaniNumeroEnvio
            : pedido?.correoTrackingNumber;
        if (tn) list = [tn];
      }
      if (list.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Indique numbers en query o asegure tracking en el pedido',
        });
        return;
      }
      const data = await shippingService.trackShipment(
        empresaId,
        provider,
        list,
        pedidoId
      );
      const response: ApiResponse = {
        success: true,
        data,
        message: 'Tracking',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  async getTrackingQuery(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;
    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }
    const parsed = shippingTrackingQuerySchema.safeParse({
      provider: typeof req.query.provider === 'string' ? req.query.provider : '',
      trackingNumber:
        typeof req.query.trackingNumber === 'string' ? req.query.trackingNumber : '',
    });
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Query inválido',
        details: parsed.error.flatten(),
      });
      return;
    }
    const { provider, trackingNumber } = parsed.data;
    try {
      const results = await shippingService.trackShipment(
        empresaId,
        provider,
        [trackingNumber.trim()],
        null
      );
      const trackingUrl = buildShippingTrackingUrl(provider, trackingNumber) ?? undefined;
      const response: ApiResponse = {
        success: true,
        data: { results, trackingUrl },
        message: 'Tracking',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  async getAgencies(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const empresaId = req.empresaId;

    if (empresaId == null) {
      res.status(403).json({ success: false, error: 'empresaId requerido.' });
      return;
    }

    const q = req.query;
    
    try {
      const defaultProv = await shippingService.resolveDefaultProvider(empresaId);
      const providerRaw = typeof q.provider === 'string' ? q.provider : undefined;
      const provider =
        providerRaw === 'correo' || providerRaw === 'andreani'
          ? providerRaw
          : defaultProv;
      const stateId = typeof q.stateId === 'string' ? q.stateId : undefined;
      const filters = {
        stateId,
        pickupAvailability: boolQuery(q.pickup),
        packageReception: boolQuery(q.reception),
      };
      const data = await shippingService.getAgencies(empresaId, provider, filters);
      const response: ApiResponse = {
        success: true,
        data,
        message: 'Sucursales',
      };
      res.json(response);
    } catch (e: unknown) {
      this.sendError(res, e);
    }
  }

  private sendError(res: Response, e: unknown): void {
    if (e instanceof ShippingValidationError) {
      res.status(400).json({
        success: false,
        error: 'Validación',
        message: e.message,
      });
      return;
    }
    if (e instanceof ShippingConfigError) {
      res.status(400).json({
        success: false,
        error: 'Configuración',
        message: e.message,
      });
      return;
    }
    if (e instanceof ShippingMethodNotSupportedError) {
      res.status(501).json({
        success: false,
        error: 'No implementado',
        message: e.message,
      });
      return;
    }
    if (e instanceof ShippingHttpError) {
      res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
        success: false,
        error: 'Proveedor de envío',
        message: e.message,
      });
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      success: false,
      error: 'Error interno',
      message,
    });
  }
}

export const shippingController = new ShippingController();
