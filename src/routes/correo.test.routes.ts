import { Router, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import { resolveCorreoEnv } from '../services/shipping/correo/correo.config';
import { CorreoProvider, getCorreoEnvLabel } from '../services/shipping/correo/correo.provider';
import type { CreateShippingOrderInput } from '../services/shipping/shipping.types';
import {
  ShippingHttpError,
  ShippingMethodNotSupportedError,
  ShippingValidationError,
} from '../services/shipping/shipping.errors';

const router = Router();

router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
});

router.use(firebaseAuthMiddleware);
// router.use(requireAdmin);

const quoteBodySchema = z.object({
  cpOrigen: z.string().min(2),
  cpDestino: z.string().min(2),
  weight: z.number().positive(),
  height: z.number().positive(),
  width: z.number().positive(),
  length: z.number().positive(),
  deliveredType: z.enum(['D', 'S']).optional(),
});

const importDryRunBodySchema = z.object({
  pedidoId: z.number().int().positive().optional(),
  empresaId: z.number().int().nonnegative().optional(),
  deliveryType: z.enum(['homeDelivery', 'agency']),
  agencyId: z.string().optional(),
  recipient: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  address: z
    .object({
      streetName: z.string().min(1),
      streetNumber: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
      floor: z.string().optional(),
      department: z.string().optional(),
    })
    .optional(),
  parcel: z.object({
    weightGrams: z.number().positive(),
    height: z.number().positive(),
    width: z.number().positive(),
    depth: z.number().positive(),
    declaredValue: z.number().nonnegative(),
  }),
  senderData: z.any().optional(),
});

function makeProvider(senderData: Prisma.JsonValue | null): CorreoProvider {
  return new CorreoProvider(
    senderData,
    resolveCorreoEnv(),
    globalThis.fetch.bind(globalThis)
  );
}

router.get('/ping', async (_req: FirebaseAuthRequest, res: Response): Promise<void> => {
  const p = makeProvider(null);
  try {
    await p.validateCredentials();
    const customerIdSuffix = await p.getCustomerIdSuffixForLogs();
    res.json({
      ok: true,
      customerId: customerIdSuffix,
      env: getCorreoEnvLabel(),
    });
  } catch {
    res.json({
      ok: false,
      customerId: null,
      env: getCorreoEnvLabel(),
    });
  }
});

router.post('/quote', async (req: FirebaseAuthRequest, res: Response): Promise<void> => {
  const parsed = quoteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Body inválido', details: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const p = makeProvider(null);
  try {
    const quotes = await p.getQuote({
      postalCodeOrigin: b.cpOrigen.trim(),
      postalCodeDestination: b.cpDestino.trim(),
      dimensions: {
        weight: b.weight,
        height: b.height,
        width: b.width,
        length: b.length,
      },
      deliveredType: b.deliveredType,
    });
    res.json({ success: true, data: quotes });
  } catch (e: unknown) {
    sendErr(res, e);
  }
});

router.get('/agencies', async (req: FirebaseAuthRequest, res: Response): Promise<void> => {
  const provinceCode = typeof req.query.provinceCode === 'string' ? req.query.provinceCode : '';
  if (!provinceCode.trim()) {
    res.status(400).json({ success: false, error: 'Query provinceCode requerido' });
    return;
  }
  const p = makeProvider(null);
  try {
    const list = await p.getAgencies({
      stateId: provinceCode.trim(),
      packageReception: true,
    });
    res.json({ success: true, data: list });
  } catch (e: unknown) {
    sendErr(res, e);
  }
});

router.post('/import-dry-run', async (req: FirebaseAuthRequest, res: Response): Promise<void> => {
  const parsed = importDryRunBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Body inválido', details: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  if (b.deliveryType === 'homeDelivery' && !b.address) {
    res.status(400).json({ success: false, error: 'address requerido para homeDelivery' });
    return;
  }
  if (b.deliveryType === 'agency' && !b.agencyId) {
    res.status(400).json({ success: false, error: 'agencyId requerido para agency' });
    return;
  }
  const input: CreateShippingOrderInput = {
    pedidoId: b.pedidoId ?? 1,
    empresaId: b.empresaId ?? 0,
    deliveryType: b.deliveryType,
    agencyId: b.agencyId,
    recipient: b.recipient,
    address: b.address,
    parcel: b.parcel,
  };
  const senderJson: Prisma.JsonValue | null =
    b.senderData != null ? (b.senderData as Prisma.JsonValue) : null;
  const p = makeProvider(senderJson);
  try {
    const data = await p.importDryRun(input);
    res.json({ success: true, data });
  } catch (e: unknown) {
    sendErr(res, e);
  }
});

router.get('/tracking', async (req: FirebaseAuthRequest, res: Response): Promise<void> => {
  const shippingId = typeof req.query.shippingId === 'string' ? req.query.shippingId : '';
  if (!shippingId.trim()) {
    res.status(400).json({ success: false, error: 'Query shippingId requerido' });
    return;
  }
  const p = makeProvider(null);
  try {
    const data = await p.getTracking([shippingId.trim()]);
    res.json({ success: true, data });
  } catch (e: unknown) {
    sendErr(res, e);
  }
});

function sendErr(res: Response, e: unknown): void {
  if (e instanceof ShippingValidationError) {
    res.status(400).json({ success: false, error: e.message });
    return;
  }
  if (e instanceof ShippingHttpError) {
    res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
      success: false,
      error: e.message,
    });
    return;
  }
  if (e instanceof ShippingMethodNotSupportedError) {
    res.status(501).json({ success: false, error: e.message });
    return;
  }
  const message = e instanceof Error ? e.message : String(e);
  res.status(500).json({ success: false, error: message });
}

export default router;
