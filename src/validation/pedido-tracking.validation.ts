import { z } from 'zod';

export const setPedidoTrackingSchema = z.object({
  provider: z.enum(['correo', 'andreani']),
  trackingNumber: z
    .string()
    .trim()
    .min(1, 'Indique el número de seguimiento')
    .max(100, 'Número de seguimiento demasiado largo'),
});

export type SetPedidoTrackingBody = z.infer<typeof setPedidoTrackingSchema>;
