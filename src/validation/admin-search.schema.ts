import { z } from 'zod';

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(15).default(12),
});

export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;
