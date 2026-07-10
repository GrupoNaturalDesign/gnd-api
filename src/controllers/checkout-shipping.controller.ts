import { Response } from 'express';
import { z } from 'zod';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import { getCheckoutEmpresaIdFromEnv } from '../lib/checkout-empresa';
import type { ApiResponse } from '../types';
import { quoteCheckoutShipping } from '../services/checkout-shipping.service';
import { shippingService } from '../services/shipping/shipping.service';
import {
  ShippingConfigError,
  ShippingHttpError,
  ShippingValidationError,
} from '../services/shipping/shipping.errors';

const quoteItemSchema = z.object({
  productoWebId: z.number().int().positive(),
  cantidad: z.number().positive(),
});

const quoteBodySchema = z.object({
  provider: z.enum(['correo', 'andreani']),
  deliveryType: z.enum(['homeDelivery', 'agency']),
  items: z.array(quoteItemSchema).min(1),
  declaredValueSubtotal: z.number().nonnegative(),
  cpDestino: z.string().min(2),
});

function boolQuery(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return undefined;
}

function sendError(res: Response, e: unknown): void {
  if (e instanceof ShippingValidationError) {
    res.status(400).json({
      success: false,
      error: 'Validación',
      message: e.message,
    });
    return;
  }
  if (e instanceof ShippingConfigError) {
    res.status(e.httpStatus).json({
      success: false,
      error: 'Configuración',
      message: e.message,
      code: e.code,
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
  if (e instanceof Error && e.message.includes('EMPRESA_ID')) {
    res.status(500).json({
      success: false,
      error: 'Configuración',
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

export class CheckoutShippingController {
  /** POST /api/checkout/shipping/quote — Firebase; cualquier usuario logueado (no admin). */
  async quote(req: FirebaseAuthRequest, res: Response): Promise<void> {
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
      const empresaId = getCheckoutEmpresaIdFromEnv();
      const data = await quoteCheckoutShipping({
        empresaId,
        ...parsed.data,
      });
      const response: ApiResponse<typeof data> = {
        success: true,
        data,
        message: 'Cotización envío',
      };
      res.json(response);
    } catch (e: unknown) {
      sendError(res, e);
    }
  }

  /** GET /api/checkout/shipping/agencies?provider=&stateId= — Firebase. */
  async agencies(req: FirebaseAuthRequest, res: Response): Promise<void> {
    const q = req.query;
    const providerRaw = typeof q.provider === 'string' ? q.provider : 'correo';
    const provider =
      providerRaw === 'andreani' || providerRaw === 'correo' ? providerRaw : 'correo';
    const stateId = typeof q.stateId === 'string' ? q.stateId : undefined;
    if (!stateId?.trim()) {
      res.status(400).json({
        success: false,
        error: 'Query stateId requerido (código provincia o filtro del proveedor)',
      });
      return;
    }
    try {
      const empresaId = getCheckoutEmpresaIdFromEnv();
      const filters = {
        stateId: stateId.trim(),
        pickupAvailability: boolQuery(q.pickup),
        packageReception: boolQuery(q.reception),
      };
      const data = await shippingService.getAgencies(empresaId, provider, filters);
      const response: ApiResponse<typeof data> = {
        success: true,
        data,
        message: 'Sucursales',
      };
      res.json(response);
    } catch (e: unknown) {
      sendError(res, e);
    }
  }
}

export const checkoutShippingController = new CheckoutShippingController();
