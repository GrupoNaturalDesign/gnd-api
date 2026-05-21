import { Request, Response } from 'express';
import type { ApiResponse } from '../types';
import { dashboardService } from '../services/dashboard.service';
import {
  dashboardAlertasQuerySchema,
  dashboardFullQuerySchema,
  dashboardKpisQuerySchema,
  dashboardRecientesQuerySchema,
  dashboardSerieQuerySchema,
  dashboardStockCriticoQuerySchema,
} from '../validation/dashboard.schema';

function getEmpresaId(req: Request): number {
  const empresaId = Number((req as Request & { empresaId?: unknown }).empresaId);
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error('No se pudo obtener empresaId.');
  }
  return empresaId;
}

function setDashboardCachingHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-cache');
}

export class DashboardAdminController {
  /** KPI período + comparación simétrica + snapshot operativo. */
  async kpis(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardKpisQuerySchema.parse(req.query);
      const data = await dashboardService.getKpis(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Dashboard KPIs' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error KPIs dashboard', message });
    }
  }

  /** Serie diaria ventas ($) por día. */
  async serieVentas(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardSerieQuerySchema.parse(req.query);
      const data = await dashboardService.getSerieVentas(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Serie ventas' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error serie ventas', message });
    }
  }

  /** Alertas operativas (sin carritos abandonados). */
  async alertas(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardAlertasQuerySchema.parse(req.query);
      const data = await dashboardService.getAlertas(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Alertas dashboard' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error alertas dashboard', message });
    }
  }

  /** Últimos pedidos (sin ítems embebidos). */
  async pedidosRecientes(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardRecientesQuerySchema.parse(req.query);
      const data = await dashboardService.getPedidosRecientes(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Pedidos recientes' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error pedidos recientes', message });
    }
  }

  async stockCritico(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardStockCriticoQuerySchema.parse(req.query);
      const data = await dashboardService.getStockCritico(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Stock crítico' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error stock crítico', message });
    }
  }

  /** Payload agregado: KPIs + serie default + alertas + recientes + stock. */
  async full(req: Request, res: Response) {
    try {
      const empresaId = getEmpresaId(req);
      const query = dashboardFullQuerySchema.parse(req.query);
      const data = await dashboardService.getFull(empresaId, query);
      setDashboardCachingHeaders(res);
      res.json({ success: true, data, message: 'Dashboard completo' } as ApiResponse);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: 'Error dashboard completo', message });
    }
  }
}

export const dashboardAdminController = new DashboardAdminController();
