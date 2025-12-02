import { z } from 'zod';
import { BaseQueryParams, BaseQueryParamsSchema } from './common.types';

// ============================================
// Subrubro Response Types
// ============================================

export const SubrubroResponseSchema = z.object({
  id: z.number(),
  empresaId: z.number(),
  rubroId: z.number(),
  sfactoryId: z.number(),
  sfactoryCodigo: z.string().nullable(),
  sfactoryRubroId: z.number(),
  nombre: z.string(),
  codigoExterno: z.string().nullable(),
  visibleWeb: z.boolean(),
  orden: z.number(),
  slug: z.string().nullable(),
  descripcionWeb: z.string().nullable(),
  imagenUrl: z.string().nullable(),
  ultimaSync: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SubrubroResponse = z.infer<typeof SubrubroResponseSchema>;

// ============================================
// Subrubro with Relations
// ============================================

export type SubrubroConRubro = SubrubroResponse & {
  rubro?: {
    id: number;
    nombre: string;
    slug: string | null;
  };
  _count?: {
    productosPadre: number;
  };
};

// ============================================
// Subrubro Query Params
// ============================================

export interface SubrubroQueryParams extends BaseQueryParams {
  rubroId?: number;
  visibleWeb?: boolean;
  includeProductos?: boolean;
}

export const SubrubroQueryParamsSchema = BaseQueryParamsSchema.extend({
  rubroId: z.coerce.number().int().positive().optional(),
  visibleWeb: z.coerce.boolean().optional(),
  includeProductos: z.coerce.boolean().optional(),
});

// ============================================
// Subrubro by ID Params
// ============================================

export interface SubrubroByIdParams {
  id: number;
  includeProductos?: boolean;
}

export const SubrubroByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  includeProductos: z.coerce.boolean().optional(),
});

// ============================================
// Subrubro by Slug Params
// ============================================

export interface SubrubroBySlugParams {
  slug: string;
  empresaId: number;
}

export const SubrubroBySlugParamsSchema = z.object({
  slug: z.string(),
  empresaId: z.coerce.number().int().positive(),
});

