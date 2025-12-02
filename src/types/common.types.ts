import { z } from 'zod';

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
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

export interface BaseQueryParams {
  empresaId: number;
  search?: string;
}

export const BaseQueryParamsSchema = z.object({
  empresaId: z.coerce.number().int().positive(),
  search: z.string().optional(),
});

