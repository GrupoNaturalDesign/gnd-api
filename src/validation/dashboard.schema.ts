import { z } from 'zod';

const dateYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe ser YYYY-MM-DD')
  .max(10);

/** Query común KPI + comparación simétrica de períodos. */
export const dashboardKpisQuerySchema = z
  .object({
    fechaDesde: dateYmd.optional(),
    fechaHasta: dateYmd.optional(),
    compare: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? true : v !== 'false')),
    segmentarTipoCliente: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? true : v !== 'false')),
  })
  .strict();

/** Serie diaria de ventas. */
export const dashboardSerieQuerySchema = z
  .object({
    fechaDesde: dateYmd.optional(),
    fechaHasta: dateYmd.optional(),
  })
  .strict();

/** Listas operativas. */
export const dashboardAlertasQuerySchema = z
  .object({
    limitePendientesConfirmacion: z.coerce.number().int().positive().max(50).optional().default(8),
    limiteSfactoryIssues: z.coerce.number().int().positive().max(50).optional().default(8),
    limitePagoPendienteAntiguo: z.coerce.number().int().positive().max(50).optional().default(8),
    /** Horas para considerar "pago pendiente viejo" (default 24). */
    horasPagoPendienteMin: z.coerce.number().int().positive().max(720).optional().default(24),
  })
  .strict();

export const dashboardRecientesQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional().default(10),
  })
  .strict();

export const dashboardStockCriticoQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(200).optional().default(20),
    maxStock: z.coerce.number().nonnegative().max(999_999).optional().default(2),
    /** Solo filas donde stock_no es null si false; si true permite null tratado como 0 en filtro opcional — aquí omitimos nulls fuera si no tiene stock sincronizado. */
    incluirSinStockSync: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

export const dashboardFullQuerySchema = z
  .object({
    fechaDesde: dateYmd.optional(),
    fechaHasta: dateYmd.optional(),
    /** Rango del gráfico (si no se envía: últimos 30 días hasta fechaHasta KPI o hoy). */
    serieFechaDesde: dateYmd.optional(),
    serieFechaHasta: dateYmd.optional(),
    compare: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? true : v !== 'false')),
    segmentarTipoCliente: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? true : v !== 'false')),
    limitePendientesConfirmacion: z.coerce.number().int().positive().max(50).optional().default(8),
    limiteSfactoryIssues: z.coerce.number().int().positive().max(50).optional().default(8),
    limitePagoPendienteAntiguo: z.coerce.number().int().positive().max(50).optional().default(8),
    horasPagoPendienteMin: z.coerce.number().int().positive().max(720).optional().default(24),
    limitRecientes: z.coerce.number().int().positive().max(50).optional().default(10),
    limitStockCritico: z.coerce.number().int().positive().max(200).optional().default(20),
    maxStockCritico: z.coerce.number().nonnegative().max(999_999).optional().default(2),
    incluirSinStockSync: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

export type DashboardKpisQuery = z.infer<typeof dashboardKpisQuerySchema>;
export type DashboardSerieQuery = z.infer<typeof dashboardSerieQuerySchema>;
export type DashboardAlertasQuery = z.infer<typeof dashboardAlertasQuerySchema>;
export type DashboardRecientesQuery = z.infer<typeof dashboardRecientesQuerySchema>;
export type DashboardStockCriticoQuery = z.infer<typeof dashboardStockCriticoQuerySchema>;
export type DashboardFullQuery = z.infer<typeof dashboardFullQuerySchema>;
