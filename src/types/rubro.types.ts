import { z } from 'zod';
import { BaseQueryParams, BaseQueryParamsSchema } from './common.types';

// ============================================
// Rubro Response Types
// ============================================

export const RubroResponseSchema = z.object({
  id: z.number(),
  empresaId: z.number(),
  sfactoryId: z.number(),
  sfactoryCodigo: z.string().nullable(),
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

export type RubroResponse = z.infer<typeof RubroResponseSchema>;

// ============================================
// Rubro with Relations
// ============================================

// Import SubrubroResponse to avoid circular dependency
import type { SubrubroResponse } from './subrubro.types';

export type RubroConSubrubros = RubroResponse & {
  subrubros?: SubrubroResponse[];
  _count?: {
    subrubros: number;
    productosPadre: number;
  };
};

// ============================================
// Rubro Query Params
// ============================================

export interface RubroQueryParams extends BaseQueryParams {
  visibleWeb?: boolean;
  includeSubrubros?: boolean;
}

export const RubroQueryParamsSchema = BaseQueryParamsSchema.extend({
  visibleWeb: z.coerce.boolean().optional(),
  includeSubrubros: z.coerce.boolean().optional(),
});

// ============================================
// Rubro by ID Params
// ============================================

export interface RubroByIdParams {
  id: number;
  includeSubrubros?: boolean;
}

export const RubroByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  includeSubrubros: z.coerce.boolean().optional(),
});

// ============================================
// Rubro by Slug Params
// ============================================

export interface RubroBySlugParams {
  slug: string;
  empresaId: number;
}

export const RubroBySlugParamsSchema = z.object({
  slug: z.string(),
  empresaId: z.coerce.number().int().positive(),
});

