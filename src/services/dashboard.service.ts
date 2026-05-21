/**
 * Dashboard operativo multi-tenant (empresa desde middleware).
 * Fechas interpretadas como días UTC (YYYY-MM-DD); documentado para cliente.
 */

import {
  EstadoPedido,
  FormaEnvio,
  PedidoSyncStatus,
  Prisma,
  TipoCliente,
} from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  DashboardAlertasQuery,
  DashboardFullQuery,
  DashboardKpisQuery,
  DashboardRecientesQuery,
  DashboardSerieQuery,
  DashboardStockCriticoQuery,
} from '../validation/dashboard.schema';

const VENTAS_ESTADOS: EstadoPedido[] = [
  EstadoPedido.confirmado,
  EstadoPedido.procesando,
  EstadoPedido.despachado,
  EstadoPedido.entregado,
];

function utcYmdToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function startUtcFromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function endUtcFromYmd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`);
}

/** Días inclusivos entre dos YMD en UTC (mismo calendario). */
function inclusiveCalendarDays(desde: string, hasta: string): number {
  const t0 = startUtcFromYmd(desde).getTime();
  const t1 = startUtcFromYmd(hasta).getTime();
  return Math.floor((t1 - t0) / 86_400_000) + 1;
}

function subtractUtcDays(ymd: string, deltaDays: number): string {
  const d = startUtcFromYmd(ymd);
  d.setUTCDate(d.getUTCDate() - deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Período inmediato anterior misma cantidad de días inclusivos que [desde, hasta]. */
function previousSymmetricRange(desdeYmd: string, hastaYmd: string): { desde: string; hasta: string } {
  const n = inclusiveCalendarDays(desdeYmd, hastaYmd);
  const prevHasta = subtractUtcDays(desdeYmd, 1);
  const prevDesde = subtractUtcDays(prevHasta, n - 1);
  return { desde: prevDesde, hasta: prevHasta };
}

function normalizeKpiDates(q: DashboardKpisQuery): { desde: string; hasta: string } {
  const h = q.fechaHasta ?? utcYmdToday();
  const d = q.fechaDesde ?? h;
  if (startUtcFromYmd(d).getTime() > startUtcFromYmd(h).getTime()) {
    throw new Error('fechaDesde no puede ser posterior a fechaHasta.');
  }
  return { desde: d, hasta: h };
}

function normalizeSerieDates(
  serieQ: DashboardSerieQuery,
  fallbackHasta: string
): { desde: string; hasta: string } {
  const h = serieQ.fechaHasta ?? fallbackHasta;
  const defaultDesde = subtractUtcDays(h, 29);
  const d = serieQ.fechaDesde ?? defaultDesde;
  if (startUtcFromYmd(d).getTime() > startUtcFromYmd(h).getTime()) {
    throw new Error('Serie: fechaDesde no puede ser posterior a fechaHasta.');
  }
  return { desde: d, hasta: h };
}

function decimalToString(v: Prisma.Decimal | null | undefined): string {
  if (v == null) return '0';
  return v.toFixed(2);
}

export interface PeriodoVentasTipoCliente {
  tipoCliente: TipoCliente;
  ventasTotales: string;
  cantidadPedidos: number;
  ticketPromedio: string | null;
}

export interface PeriodMetricasDashboard {
  pedidosNuevos: number;
  ventasTotales: string;
  cantidadPedidosVentas: number;
  ticketPromedio: string | null;
  porTipoCliente: PeriodoVentasTipoCliente[];
}

export interface DashPedidoSnippet {
  id: number;
  clienteNombre: string;
  clienteEmail: string;
  total: string;
  estadoInterno: EstadoPedido;
  estadoErp: string | null;
  sfactoryEstado: string | null;
  syncStatus: PedidoSyncStatus;
  formaEnvio: FormaEnvio | null;
  fechaPedido: string;
  expiresAt: string | null;
}

export interface DashStockCriticoRow {
  id: number;
  nombre: string;
  sfactoryCodigo: string;
  productoPadreId: number;
  stockCache: string | null;
  precioCache: string | null;
}

class DashboardService {
  private async aggregatePeriodMetrics(
    empresaId: number,
    desdeYmd: string,
    hastaYmd: string,
    segmentarTipoCliente: boolean
  ): Promise<PeriodMetricasDashboard> {
    const gte = startUtcFromYmd(desdeYmd);
    const lte = endUtcFromYmd(hastaYmd);

    const [pedidosNuevos, ventasAgg, porTipoRaw] = await Promise.all([
      prisma.pedido.count({
        where: {
          empresaId,
          estadoInterno: { not: EstadoPedido.carrito },
          fechaPedido: { gte, lte },
        },
      }),
      prisma.pedido.aggregate({
        where: {
          empresaId,
          estadoInterno: { in: VENTAS_ESTADOS },
          fechaPedido: { gte, lte },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      segmentarTipoCliente
        ? prisma.pedido.groupBy({
            by: ['tipoCliente'],
            where: {
              empresaId,
              estadoInterno: { in: VENTAS_ESTADOS },
              fechaPedido: { gte, lte },
            },
            _sum: { total: true },
            _count: { _all: true },
          })
        : Promise.resolve([] as { tipoCliente: TipoCliente; _sum: { total: Prisma.Decimal | null }; _count: { _all: number } }[]),
    ]);

    const cantidadPedidosVentas = ventasAgg._count._all;
    const sumTotal = ventasAgg._sum.total;
    const ventasTotales = decimalToString(sumTotal ?? new Prisma.Decimal(0));
    const ticketPromedio =
      cantidadPedidosVentas > 0 && sumTotal != null
        ? decimalToString(sumTotal.div(cantidadPedidosVentas))
        : null;

    const porTipoCliente: PeriodoVentasTipoCliente[] = segmentarTipoCliente
      ? porTipoRaw.map((row) => {
          const ct = row._count._all;
          const st = row._sum.total;
          const tot = decimalToString(st ?? new Prisma.Decimal(0));
          return {
            tipoCliente: row.tipoCliente,
            ventasTotales: tot,
            cantidadPedidos: ct,
            ticketPromedio: ct > 0 && st != null ? decimalToString(st.div(ct)) : null,
          };
        })
      : [];

    return {
      pedidosNuevos,
      ventasTotales,
      cantidadPedidosVentas,
      ticketPromedio,
      porTipoCliente,
    };
  }

  private async snapshotOperativo(empresaId: number) {
    const [pendientesConfirmacion, erroresSfactory] = await Promise.all([
      prisma.pedido.count({
        where: { empresaId, estadoInterno: EstadoPedido.pendiente_confirmacion },
      }),
      prisma.pedido.count({
        where: {
          empresaId,
          OR: [
            { estadoInterno: EstadoPedido.fallido },
            { syncStatus: { in: [PedidoSyncStatus.error, PedidoSyncStatus.conflict] } },
          ],
        },
      }),
    ]);
    return { pendientesConfirmacion, erroresSfactory };
  }

  private mapPedidoSnippetRow(r: {
    id: number;
    clienteNombre: string;
    clienteEmail: string;
    total: Prisma.Decimal;
    estadoInterno: EstadoPedido;
    estadoErp: unknown;
    sfactoryEstado: string | null;
    syncStatus: PedidoSyncStatus;
    formaEnvio: FormaEnvio | null;
    fechaPedido: Date;
    expiresAt: Date | null;
  }): DashPedidoSnippet {
    return {
      id: r.id,
      clienteNombre: r.clienteNombre,
      clienteEmail: r.clienteEmail,
      total: decimalToString(r.total),
      estadoInterno: r.estadoInterno,
      estadoErp: r.estadoErp == null ? null : String(r.estadoErp),
      sfactoryEstado: r.sfactoryEstado,
      syncStatus: r.syncStatus,
      formaEnvio: r.formaEnvio,
      fechaPedido: r.fechaPedido.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    };
  }

  async getKpis(empresaId: number, query: DashboardKpisQuery) {
    const { desde: desdeYmd, hasta: hastaYmd } = normalizeKpiDates(query);
    const compare = query.compare;
    const segmentar = query.segmentarTipoCliente;

    const snapshot = await this.snapshotOperativo(empresaId);
    const actual = await this.aggregatePeriodMetrics(empresaId, desdeYmd, hastaYmd, segmentar);

    let anterior: PeriodMetricasDashboard | undefined;
    let rangoComparacion: { desde: string; hasta: string } | undefined;
    if (compare) {
      rangoComparacion = previousSymmetricRange(desdeYmd, hastaYmd);
      anterior = await this.aggregatePeriodMetrics(
        empresaId,
        rangoComparacion.desde,
        rangoComparacion.hasta,
        segmentar
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      rangoActual: { desde: desdeYmd, hasta: hastaYmd },
      rangoComparacion,
      snapshot,
      metricas: {
        actual,
        ...(anterior != null ? { anterior } : {}),
      },
    };
  }

  async getSerieVentas(empresaId: number, serieQuery: DashboardSerieQuery, kpiFallbackHasta?: string) {
    const fallbackH = kpiFallbackHasta ?? utcYmdToday();
    const { desde: desdeYmd, hasta: hastaYmd } = normalizeSerieDates(serieQuery, fallbackH);
    const desde = startUtcFromYmd(desdeYmd);
    const hasta = endUtcFromYmd(hastaYmd);

    const ventasLista = await prisma.$queryRaw<
      { d: Date; ventasTotales: Prisma.Decimal; cantidadPedidos: bigint }[]
    >(Prisma.sql`
      SELECT DATE(p.fecha_pedido) AS d,
             COALESCE(SUM(p.total), 0) AS ventasTotales,
             COUNT(*) AS cantidadPedidos
      FROM pedidos p
      WHERE p.empresa_id = ${empresaId}
        AND p.estado_interno IN ('confirmado', 'procesando', 'despachado', 'entregado')
        AND p.fecha_pedido >= ${desde}
        AND p.fecha_pedido <= ${hasta}
      GROUP BY DATE(p.fecha_pedido)
      ORDER BY d ASC
    `);

    const puntos = ventasLista.map((row) => ({
      fecha: row.d instanceof Date ? row.d.toISOString().slice(0, 10) : String(row.d).slice(0, 10),
      ventasTotales: decimalToString(row.ventasTotales ?? new Prisma.Decimal(0)),
      cantidadPedidos: Number(row.cantidadPedidos),
    }));

    return {
      generatedAt: new Date().toISOString(),
      rangoSerie: { desde: desdeYmd, hasta: hastaYmd },
      puntos,
    };
  }

  async getAlertas(empresaId: number, query: DashboardAlertasQuery) {
    const horasMs = query.horasPagoPendienteMin * 60 * 60 * 1000;
    const antesDe = new Date(Date.now() - horasMs);

    const sfactoryWhere: Prisma.PedidoWhereInput = {
      empresaId,
      OR: [
        { estadoInterno: EstadoPedido.fallido },
        { syncStatus: { in: [PedidoSyncStatus.error, PedidoSyncStatus.conflict] } },
      ],
    };

    const [pendientesConfirmacion, sfactoryIssues, pagoPendienteAntiguo] = await Promise.all([
      prisma.pedido.findMany({
        where: { empresaId, estadoInterno: EstadoPedido.pendiente_confirmacion },
        orderBy: { fechaPedido: 'asc' },
        take: query.limitePendientesConfirmacion,
        select: {
          id: true,
          clienteNombre: true,
          clienteEmail: true,
          total: true,
          estadoInterno: true,
          estadoErp: true,
          sfactoryEstado: true,
          syncStatus: true,
          formaEnvio: true,
          fechaPedido: true,
          expiresAt: true,
        },
      }),
      prisma.pedido.findMany({
        where: sfactoryWhere,
        orderBy: { fechaPedido: 'desc' },
        take: query.limiteSfactoryIssues,
        select: {
          id: true,
          clienteNombre: true,
          clienteEmail: true,
          total: true,
          estadoInterno: true,
          estadoErp: true,
          sfactoryEstado: true,
          syncStatus: true,
          formaEnvio: true,
          fechaPedido: true,
          expiresAt: true,
        },
      }),
      prisma.pedido.findMany({
        where: {
          empresaId,
          estadoInterno: EstadoPedido.pendiente_pago,
          fechaPedido: { lte: antesDe },
        },
        orderBy: { fechaPedido: 'asc' },
        take: query.limitePagoPendienteAntiguo,
        select: {
          id: true,
          clienteNombre: true,
          clienteEmail: true,
          total: true,
          estadoInterno: true,
          estadoErp: true,
          sfactoryEstado: true,
          syncStatus: true,
          formaEnvio: true,
          fechaPedido: true,
          expiresAt: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      horasPagoPendienteMin: query.horasPagoPendienteMin,
      pendientesConfirmacion: pendientesConfirmacion.map((r) => this.mapPedidoSnippetRow(r)),
      sfactoryIssues: sfactoryIssues.map((r) => this.mapPedidoSnippetRow(r)),
      pagoPendienteAntiguo: pagoPendienteAntiguo.map((r) => this.mapPedidoSnippetRow(r)),
    };
  }

  async getPedidosRecientes(empresaId: number, query: DashboardRecientesQuery) {
    const rows = await prisma.pedido.findMany({
      where: { empresaId },
      orderBy: { fechaPedido: 'desc' },
      take: query.limit,
      select: {
        id: true,
        clienteNombre: true,
        clienteEmail: true,
        total: true,
        estadoInterno: true,
        estadoErp: true,
        sfactoryEstado: true,
        syncStatus: true,
        formaEnvio: true,
        fechaPedido: true,
        expiresAt: true,
      },
    });

    return {
      generatedAt: new Date().toISOString(),
      items: rows.map((r) => this.mapPedidoSnippetRow(r)),
    };
  }

  async getStockCritico(empresaId: number, query: DashboardStockCriticoQuery) {
    const maxStock = new Prisma.Decimal(query.maxStock);
    const where: Prisma.ProductoWebWhereInput = {
      empresaId,
      activoSfactory: true,
      stockCache: { not: null, lte: maxStock },
    };

    const rows = await prisma.productoWeb.findMany({
      where,
      orderBy: [{ stockCache: 'asc' }, { nombre: 'asc' }],
      take: query.limit,
      select: {
        id: true,
        nombre: true,
        sfactoryCodigo: true,
        productoPadreId: true,
        stockCache: true,
        precioCache: true,
      },
    });

    let outRows: DashStockCriticoRow[] = rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      sfactoryCodigo: r.sfactoryCodigo,
      productoPadreId: r.productoPadreId,
      stockCache: r.stockCache != null ? decimalToString(r.stockCache) : null,
      precioCache: r.precioCache != null ? decimalToString(r.precioCache) : null,
    }));

    if (query.incluirSinStockSync) {
      const extra = await prisma.productoWeb.findMany({
        where: {
          empresaId,
          activoSfactory: true,
          stockCache: null,
        },
        orderBy: { nombre: 'asc' },
        take: Math.max(0, query.limit - outRows.length),
        select: {
          id: true,
          nombre: true,
          sfactoryCodigo: true,
          productoPadreId: true,
          stockCache: true,
          precioCache: true,
        },
      });
      const mapped = extra.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        sfactoryCodigo: r.sfactoryCodigo,
        productoPadreId: r.productoPadreId,
        stockCache: r.stockCache != null ? decimalToString(r.stockCache) : null,
        precioCache: r.precioCache != null ? decimalToString(r.precioCache) : null,
      }));
      outRows = [...outRows, ...mapped].slice(0, query.limit);
    }

    return {
      generatedAt: new Date().toISOString(),
      maxStock: query.maxStock,
      items: outRows,
    };
  }

  async getFull(empresaId: number, query: DashboardFullQuery) {
    const kpiIn: DashboardKpisQuery = {
      fechaDesde: query.fechaDesde,
      fechaHasta: query.fechaHasta,
      compare: query.compare,
      segmentarTipoCliente: query.segmentarTipoCliente,
    };
    const { hasta: hastaKpi } = normalizeKpiDates(kpiIn);

    const alertasIn: DashboardAlertasQuery = {
      limitePendientesConfirmacion: query.limitePendientesConfirmacion,
      limiteSfactoryIssues: query.limiteSfactoryIssues,
      limitePagoPendienteAntiguo: query.limitePagoPendienteAntiguo,
      horasPagoPendienteMin: query.horasPagoPendienteMin,
    };

    const stockIn: DashboardStockCriticoQuery = {
      limit: query.limitStockCritico,
      maxStock: query.maxStockCritico,
      incluirSinStockSync: query.incluirSinStockSync,
    };

    const [kpis, serieVentas, alertas, recientes, stockCritico] = await Promise.all([
      this.getKpis(empresaId, kpiIn),
      this.getSerieVentas(
        empresaId,
        {
          fechaDesde: query.serieFechaDesde,
          fechaHasta: query.serieFechaHasta,
        },
        hastaKpi
      ),
      this.getAlertas(empresaId, alertasIn),
      this.getPedidosRecientes(empresaId, { limit: query.limitRecientes }),
      this.getStockCritico(empresaId, stockIn),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      kpis,
      serieVentas,
      alertas,
      pedidosRecientes: recientes,
      stockCritico,
    };
  }
}

export const dashboardService = new DashboardService();
