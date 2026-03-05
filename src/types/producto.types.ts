import { z } from 'zod';
import { BaseQueryParams, BaseQueryParamsSchema, PaginatedResponse } from './common.types';

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
  nombre: z.string(),
  descripcionCompleta: z.string().nullable(),
  sexo: z.string().nullable(),
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
// ProductoPrecio Response Types
// ============================================

export const ProductoPrecioResponseSchema = z.object({
  id: z.number(),
  productoWebId: z.number(),
  tipoCliente: z.enum(['minorista', 'mayorista']),
  precio: z.number(),
  precioLista: z.number(),
  precioTransfer: z.number().nullable(),
  precioFinanciado: z.number().nullable(),
  cuotasFinanciado: z.number().nullable(),
  precioSinImp: z.number().nullable(),
  minimoUnidades: z.number().nullable(),
});

export type ProductoPrecioResponse = z.infer<typeof ProductoPrecioResponseSchema>;

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

// ============================================
// Productos Activos para Ecommerce (Público)
// ============================================

export interface ProductoActivoQueryParams {
  empresaId: number; // Requerido para ecommerce
  destacado?: boolean | undefined;
  rubroId?: number | undefined;
  subrubroId?: number | undefined;
  search?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sortBy?: 'nombre' | 'precio' | 'destacado' | 'orden' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export const ProductoActivoQueryParamsSchema = z.object({
  empresaId: z.coerce.number().int().positive(),
  destacado: z.coerce.boolean().optional(),
  rubroId: z.coerce.number().int().positive().optional(),
  subrubroId: z.coerce.number().int().positive().optional(),
  search: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().min(1).max(100).default(20),
  sortBy: z.enum(['nombre', 'precio', 'destacado', 'orden']).default('orden'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ============================================
// Productos Publicados Optimizados para Ecommerce
// ============================================

export interface ProductoPublicadoQueryParams {
  empresaId?: number; // Obtenido internamente, no requerido como parámetro
  destacado?: boolean;
  rubroId?: number;
  subrubroId?: number;
  search?: string;
  tieneStock?: boolean;
  sexo?: string;
  color?: string;
  talle?: string;
  page?: number;
  limit?: number;
  sortBy?: 'destacado' | 'nombre' | 'precio' | 'orden';
  sortOrder?: 'asc' | 'desc';
}

// Query params envían "true"/"false" como string; z.coerce.boolean() trata "false" como true (truthy)
function parseQueryBoolean(val: unknown): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0' || s === '') return false;
  return undefined;
}

export const ProductoPublicadoQueryParamsSchema = z.object({
  empresaId: z.coerce.number().int().positive().optional(), // Opcional en el schema
  destacado: z.preprocess(parseQueryBoolean, z.boolean().optional()),
  rubroId: z.coerce.number().int().positive().optional(),
  subrubroId: z.coerce.number().int().positive().optional(),
  search: z.string().min(1).max(200).optional(),
  tieneStock: z.preprocess(parseQueryBoolean, z.boolean().optional()),
  sexo: z.string().max(50).optional(),
  color: z.string().max(100).optional(),
  talle: z.string().max(50).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().min(1).max(100).default(20),
  sortBy: z.preprocess(
    (val) => {
      const s = Array.isArray(val) ? val[0] : val;
      return typeof s === 'string' ? s.toLowerCase() : s;
    },
    z.enum(['destacado', 'nombre', 'precio', 'orden']).default('orden')
  ),
  sortOrder: z.preprocess(
    (val) => {
      const s = Array.isArray(val) ? val[0] : val;
      return typeof s === 'string' ? s.toLowerCase() : s;
    },
    z.enum(['asc', 'desc']).default('asc')
  ),
});

// Estructura optimizada de respuesta
export interface VariantePublicada {
  id: number;
  codigo: string;
  color: string | null;
  talle: string | null;
  // sexo eliminado - se hereda del producto padre
  stock: number;
  precio: number;
  imagen: string | null; // Imagen por color (todas las variantes del mismo color tienen la misma)
  tieneImagen: boolean;
}

export interface ProductoPublicado {
  // Datos básicos
  id: number;
  codigoAgrupacion: string;
  slug: string | null;
  nombre: string;
  descripcion: string | null;
  descripcionCorta: string | null;
  
  // Metadatos
  destacado: boolean;
  orden: number;
  sexo: string | null; // Sexo del producto padre (heredado por todas las variantes)
  rubro: {
    id: number;
    nombre: string;
    slug: string;
  } | null;
  subrubro: {
    id: number;
    nombre: string;
    slug: string;
  } | null;
  
  // Imagen principal
  imagenPrincipal: string | null;
  
  // Precios calculados
  precioLista: number | null;
  precioTransfer: number | null;
  precio3Cuotas: number | null;
  precioSinImp: number | null;
  
  // Variantes simplificadas
  variantes: VariantePublicada[];
  
  // Agregados pre-calculados
  colores: string[];
  talles: string[];
  totalVariantes: number;
  tieneStock: boolean;
  stockTotal: number;
  precioMin: number | null;
  precioMax: number | null;
}

export interface ProductosPublicadosResponse extends PaginatedResponse<ProductoPublicado> {
  // Filtros eliminados - se implementarán con endpoints separados si se necesitan
}

