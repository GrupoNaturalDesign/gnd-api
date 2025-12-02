import { z } from 'zod';

// ============================================
// Empresa Response Types
// ============================================

export const EmpresaResponseSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  nombre: z.string(),
  razonSocial: z.string(),
  cuit: z.string().nullable(),
  sfactoryCompanyKey: z.string(),
  sfactoryUserId: z.number().nullable(),
  activa: z.boolean(),
  logoUrl: z.string().nullable(),
  colores: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EmpresaResponse = z.infer<typeof EmpresaResponseSchema>;

// ============================================
// Empresa Query Params
// ============================================

export interface EmpresaQueryParams {
  activa?: boolean;
}

export const EmpresaQueryParamsSchema = z.object({
  activa: z.coerce.boolean().optional(),
});

