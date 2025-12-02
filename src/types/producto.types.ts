import { z } from 'zod';
import { BaseQueryParams, BaseQueryParamsSchema } from './common.types';

// ============================================
// ProductoWeb Response Types
// ============================================

export const ProductoWebResponseSchema = z.object({
  id: z.number(),
  empresaId: z.number(),
  productoPadreId: z.number(),
  sfactoryId: z.number(),
  sfactoryCodigo: z.string(),
  sfactoryBarcode: z.string().nullable(),
  descripcionCompleta: z.string(),
  talle: z.string().nullable(),
  color: z.string().nullable(),
  precioCache: z.number().nullable(),
  stockCache: z.number().nullable(),
  ultimaSyncSfactory: z.date().nullable(),
  activoSfactory: z.boolean(),
  imagenVariante: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProductoWebResponse = z.infer<typeof ProductoWebResponseSchema>;

// ============================================
// ProductoPadre Response Types
// ============================================

export const ProductoPadreResponseSchema = z.object({
  id: z.number(),
  empresaId: z.number(),
  codigoAgrupacion: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  agrupacionTipo: z.enum(['automatico', 'manual', 'hibrido']),
  agrupacionConfirmada: z.boolean(),
  rubroId: z.number().nullable(),
  subrubroId: z.number().nullable(),
  linea: z.string().nullable(),
  material: z.string().nullable(),
  um: z.string().nullable(),
  publicado: z.boolean(),
  destacado: z.boolean(),
  orden: z.number(),
  descripcionMarketing: z.string().nullable(),
  descripcionCorta: z.string().nullable(),
  slug: z.string().nullable(),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  imagenes: z.any().nullable(),
  videoUrl: z.string().nullable(),
  fichaTecnicaUrl: z.string().nullable(),
  tablaTallesUrl: z.string().nullable(),
  camposPersonalizados: z.any().nullable(),
  coloresDisponibles: z.any().nullable(),
  tallesDisponibles: z.any().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProductoPadreResponse = z.infer<typeof ProductoPadreResponseSchema>;

// ============================================
// ProductoPadre with Relations
// ============================================

export type ProductoPadreConVariantes = ProductoPadreResponse & {
  productosWeb?: ProductoWebResponse[];
  rubro?: {
    id: number;
    nombre: string;
    slug: string | null;
  } | null;
  subrubro?: {
    id: number;
    nombre: string;
    slug: string | null;
  } | null;
  _count?: {
    productosWeb: number;
  };
};

// ============================================
// Producto Query Params
// ============================================

export interface ProductoQueryParams extends BaseQueryParams {
  rubroId?: number;
  subrubroId?: number;
  publicado?: boolean;
  destacado?: boolean;
  includeVariantes?: boolean;
}

export const ProductoQueryParamsSchema = BaseQueryParamsSchema.extend({
  rubroId: z.coerce.number().int().positive().optional(),
  subrubroId: z.coerce.number().int().positive().optional(),
  publicado: z.coerce.boolean().optional(),
  destacado: z.coerce.boolean().optional(),
  includeVariantes: z.coerce.boolean().optional(),
});

// ============================================
// Producto by ID Params
// ============================================

export interface ProductoByIdParams {
  id: number;
  includeVariantes?: boolean;
}

export const ProductoByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  includeVariantes: z.coerce.boolean().optional(),
});

// ============================================
// Producto by Slug Params
// ============================================

export interface ProductoBySlugParams {
  slug: string;
  empresaId: number;
  includeVariantes?: boolean;
}

export const ProductoBySlugParamsSchema = z.object({
  slug: z.string(),
  empresaId: z.coerce.number().int().positive(),
  includeVariantes: z.coerce.boolean().optional(),
});

