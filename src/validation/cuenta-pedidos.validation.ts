import { z } from 'zod';

export const cuentaPedidosListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const cuentaPedidoIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CuentaPedidosListQuery = z.infer<typeof cuentaPedidosListQuerySchema>;
