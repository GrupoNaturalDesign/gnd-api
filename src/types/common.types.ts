import { z } from 'zod';

// ============================================
// API Response Types (Normalizados)
// ============================================

/**
 * Respuesta API normalizada y consistente
 * Usada en TODOS los endpoints del backend
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  details?: Array<{
    code?: string;
    path?: (string | number)[];
    message?: string;
  }>;
}

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  details: z.array(z.object({
    code: z.string().optional(),
    path: z.array(z.union([z.string(), z.number()])).optional(),
    message: z.string().optional(),
  })).optional(),
});

/**
 * Respuesta API con paginación
 * Extiende ApiResponse agregando información de paginación
 */
export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const PaginatedApiResponseSchema = ApiResponseSchema.extend({
  data: z.array(z.any()).optional(),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

// ============================================
// Pagination Types
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Query Params Base
// ============================================

export interface BaseQueryParams extends PaginationParams {
  empresaId?: number;
  search?: string;
}

export const BaseQueryParamsSchema = PaginationParamsSchema.extend({
  empresaId: z.preprocess(
    (val) => {
      // Si es undefined, null o string vacío, retornar undefined
      if (val === undefined || val === null || val === '') {
        return undefined;
      }
      // Intentar convertir a número
      const num = typeof val === 'string' ? Number(val) : val;
      // Si es NaN o no es un número válido, retornar undefined
      if (typeof num !== 'number' || isNaN(num) || !isFinite(num) || num <= 0) {
        return undefined;
      }
      return num;
    },
    z.number().int().positive().optional()
  ),
  search: z.string().optional(),
});

