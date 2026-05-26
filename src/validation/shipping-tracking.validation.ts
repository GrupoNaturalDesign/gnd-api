import { z } from 'zod';

export const shippingTrackingQuerySchema = z.object({
  provider: z.enum(['correo', 'andreani']),
  trackingNumber: z.string().trim().min(1, 'Indique el número de envío'),
});

export type ShippingTrackingQuery = z.infer<typeof shippingTrackingQuerySchema>;
