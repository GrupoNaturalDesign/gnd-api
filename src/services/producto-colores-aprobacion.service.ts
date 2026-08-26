import prisma from '../lib/prisma';
import {
  activoSfactoryConWhitelist,
  esColorPendienteAprobacion,
  listarColoresAprobadosPorPadreIds,
} from '../config/colores-padre-whitelist.utils';
import {
  activoSfactoryDesdeDeposito,
  obtenerInventarioPorCodigos,
} from '../utils/sfactory-stock-fetch.utils';
import { refrescarColoresDisponiblesPadres } from '../utils/padre-colores-sync.utils';
import { canonizarColor, type ColorCanonico } from '../constants/variantes-filtros';
import { getDbWriteConcurrency } from '../lib/db-config';

export type ColorPendienteResponse = {
  color: ColorCanonico;
  variantesCount: number;
  stockTotal: number;
  tieneImagen: boolean;
};

export class ProductoColoresAprobacionService {
  async listarColoresAprobados(productoPadreId: number): Promise<Set<ColorCanonico>> {
    const rows = await prisma.productoPadreColorAprobado.findMany({
      where: { productoPadreId },
      select: { color: true },
    });
    return new Set(
      rows
        .map((r) => canonizarColor(r.color))
        .filter((c): c is ColorCanonico => c != null)
    );
  }

  async listarColoresPendientes(
    productoPadreId: number,
    empresaId: number
  ): Promise<ColorPendienteResponse[]> {
    const padre = await prisma.productoPadre.findFirst({
      where: { id: productoPadreId, empresaId },
      select: { id: true, codigoAgrupacion: true },
    });
    if (!padre) return [];

    const aprobados = await this.listarColoresAprobados(padre.id);
    const variantes = await prisma.productoWeb.findMany({
      where: { productoPadreId: padre.id, empresaId },
      select: {
        color: true,
        stockCache: true,
        imagenVariante: true,
        imagenes: { select: { id: true }, take: 1 },
      },
    });

    const byColor = new Map<
      ColorCanonico,
      { count: number; stock: number; tieneImagen: boolean }
    >();

    for (const v of variantes) {
      if (
        !esColorPendienteAprobacion(
          padre.codigoAgrupacion,
          v.color,
          aprobados,
          Number(v.stockCache ?? 0)
        )
      ) {
        continue;
      }
      const canon = canonizarColor(v.color!);
      if (!canon) continue;
      const prev = byColor.get(canon) ?? { count: 0, stock: 0, tieneImagen: false };
      byColor.set(canon, {
        count: prev.count + 1,
        stock: prev.stock + Number(v.stockCache ?? 0),
        tieneImagen:
          prev.tieneImagen ||
          Boolean(v.imagenVariante) ||
          (v.imagenes?.length ?? 0) > 0,
      });
    }

    return [...byColor.entries()]
      .map(([color, data]) => ({
        color,
        variantesCount: data.count,
        stockTotal: data.stock,
        tieneImagen: data.tieneImagen,
      }))
      .sort((a, b) => a.color.localeCompare(b.color));
  }

  async contarColoresPendientesPorPadres(
    empresaId: number,
    padreIds: number[]
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (padreIds.length === 0) return result;

    const padres = await prisma.productoPadre.findMany({
      where: { empresaId, id: { in: padreIds } },
      select: { id: true, codigoAgrupacion: true },
    });
    const aprobadosPorPadre = await listarColoresAprobadosPorPadreIds(padreIds);

    const variantes = await prisma.productoWeb.findMany({
      where: { empresaId, productoPadreId: { in: padreIds } },
      select: {
        productoPadreId: true,
        color: true,
        stockCache: true,
      },
    });

    const padreById = new Map(padres.map((p) => [p.id, p]));
    const pendingColorsByPadre = new Map<number, Set<ColorCanonico>>();

    for (const v of variantes) {
      const padre = padreById.get(v.productoPadreId);
      if (!padre) continue;
      const aprobados = aprobadosPorPadre.get(v.productoPadreId) ?? new Set();
      if (
        !esColorPendienteAprobacion(
          padre.codigoAgrupacion,
          v.color,
          aprobados,
          Number(v.stockCache ?? 0)
        )
      ) {
        continue;
      }
      const canon = v.color ? canonizarColor(v.color) : null;
      if (!canon) continue;
      const set = pendingColorsByPadre.get(v.productoPadreId) ?? new Set();
      set.add(canon);
      pendingColorsByPadre.set(v.productoPadreId, set);
    }

    for (const [padreId, colors] of pendingColorsByPadre) {
      result.set(padreId, colors.size);
    }
    return result;
  }

  async aprobarColor(
    productoPadreId: number,
    empresaId: number,
    colorInput: string,
    aprobadoPor?: string | null
  ): Promise<{ color: ColorCanonico; variantesActivadas: number }> {
    const canon = canonizarColor(colorInput);
    if (!canon) {
      throw new Error('Color inválido');
    }

    const padre = await prisma.productoPadre.findFirst({
      where: { id: productoPadreId, empresaId },
      select: { id: true, codigoAgrupacion: true, rubroId: true },
    });
    if (!padre) {
      throw new Error('Producto no encontrado');
    }

    await prisma.productoPadreColorAprobado.upsert({
      where: {
        productoPadreId_color: {
          productoPadreId,
          color: canon,
        },
      },
      create: {
        empresaId,
        productoPadreId,
        color: canon,
        aprobadoPor: aprobadoPor ?? null,
      },
      update: {
        aprobadoPor: aprobadoPor ?? null,
      },
    });

    const aprobados = await this.listarColoresAprobados(productoPadreId);
    const variantes = await prisma.productoWeb.findMany({
      where: {
        productoPadreId,
        empresaId,
        color: canon,
      },
      select: {
        id: true,
        sfactoryCodigo: true,
        color: true,
        activoSfactory: true,
      },
    });

    const codigos = variantes.map((v) => v.sfactoryCodigo).filter(Boolean);
    let inventario = new Map<string, { stock: number; salePrice: number | null }>();
    if (codigos.length > 0) {
      const inv = await obtenerInventarioPorCodigos(codigos);
      inventario = inv.inventarioPorCodigo;
    }

    let variantesActivadas = 0;
    const concurrency = getDbWriteConcurrency();
    for (let i = 0; i < variantes.length; i += concurrency) {
      const chunk = variantes.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (v) => {
          const activoDeposito = activoSfactoryDesdeDeposito(v.sfactoryCodigo, inventario);
          const debeActivo = activoSfactoryConWhitelist(
            padre.codigoAgrupacion,
            v.color,
            activoDeposito,
            aprobados
          );
          if (debeActivo === v.activoSfactory) return;
          await prisma.productoWeb.update({
            where: { id: v.id },
            data: { activoSfactory: debeActivo },
          });
          if (debeActivo) variantesActivadas++;
        })
      );
    }

    if (padre.rubroId != null) {
      await refrescarColoresDisponiblesPadres(prisma, empresaId, [padre.rubroId], [
        productoPadreId,
      ]);
    }

    return { color: canon, variantesActivadas };
  }
}

export const productoColoresAprobacionService = new ProductoColoresAprobacionService();
