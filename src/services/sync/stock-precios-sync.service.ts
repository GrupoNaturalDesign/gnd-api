import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import { productoPrecioService } from '../productoPrecio.service';
import { getDbWriteConcurrency } from '../../lib/db-config';
import { shouldUpdateStockPrecio } from '../../utils/sync-hash.utils';
import { activoSfactoryConWhitelist } from '../../config/colores-padre-whitelist.utils';
import {
  activoSfactoryDesdeDeposito,
  fetchStockRowsResilient,
  getEcommerceWarehouseId,
  inventarioDesdeStockRow,
  obtenerInventarioPorCodigos,
  STOCK_BATCH_CODES,
  type InventarioDepositoRow,
  type StockRow,
} from '../../utils/sfactory-stock-fetch.utils';
import {
  publicarPadresSublineaAlineados,
  refrescarColoresDisponiblesPadres,
} from '../../utils/padre-colores-sync.utils';
import {
  computeStockCacheConReservas,
  getReservasActivasPorProductoWebId,
} from './stock-reservas.util';

const BATCH_CODES = STOCK_BATCH_CODES;

export interface StockPreciosSyncResult {
  warehouseId: number;
  codigosConsultados: number;
  variantesActualizadas: number;
  /** Variantes sin cambios respecto a cache local (no se escribió en BD). */
  variantesOmitidas: number;
  /** Upserts de precio minorista por cambio de sale_price. */
  preciosActualizados: number;
  /** Lotes lógicos (trozos de hasta BATCH_CODES códigos). */
  lotes: number;
  /** Total de llamadas HTTP a inventory_stock_items_by_warehouse_v2 (incluye reintentos por código omitido). */
  llamadasApi: number;
  /** Códigos que S-Factory indicó como inexistentes (se omitieron y se siguió con el resto). */
  codigosOmitidos: string[];
  /** Variantes desactivadas por no estar vendibles en depósito ecommerce. */
  variantesDesactivadas: number;
  /** Variantes reactivadas por stock/precio en depósito. */
  variantesActivadas: number;
  /** Padres despublicados sin variantes vendibles (solo si despublicarPadresSinVendibles). */
  padresDespublicados: number;
}

export interface DesactivarFueraDepositoResult {
  variantesDesactivadas: number;
  variantesActivadas: number;
  padresDespublicados: number;
  codigosOmitidos: string[];
  /** Padres de sublínea publicados por alineación post-sync. */
  publicadosSublinea: number;
  /** Padres con colores_disponibles refrescados. */
  coloresPadresRefrescados: number;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

type VarianteStockRow = {
  id: number;
  sfactoryCodigo: string;
  stockCache: Prisma.Decimal | null;
  precioCache: Prisma.Decimal | null;
};

interface BatchSyncAccum {
  variantesActualizadas: number;
  variantesOmitidas: number;
  preciosActualizados: number;
  lotes: number;
  llamadasApi: number;
  codigosOmitidos: string[];
};

function emptyStockPreciosResult(warehouseId: number): StockPreciosSyncResult {
  return {
    warehouseId,
    codigosConsultados: 0,
    variantesActualizadas: 0,
    variantesOmitidas: 0,
    preciosActualizados: 0,
    lotes: 0,
    llamadasApi: 0,
    codigosOmitidos: [],
    variantesDesactivadas: 0,
    variantesActivadas: 0,
    padresDespublicados: 0,
  };
}

export class StockPreciosSyncService {
  private async syncVariantesStockFromSfactory(
    wid: number,
    codigos: string[],
    varianteByCodigo: Map<string, VarianteStockRow>,
    acc: BatchSyncAccum,
    inventarioPorCodigo?: Map<string, InventarioDepositoRow>,
    reservasPorProductoWebId?: Map<number, Prisma.Decimal>
  ): Promise<void> {
    for (let i = 0; i < codigos.length; i += BATCH_CODES) {
      const chunk = codigos.slice(i, i + BATCH_CODES);
      acc.lotes++;

      const { rows, apiCalls: calls } = await fetchStockRowsResilient(
        wid,
        chunk,
        acc.codigosOmitidos
      );
      acc.llamadasApi += calls;
      for (const row of rows) {
        const inv = inventarioDesdeStockRow(row);
        if (inventarioPorCodigo) {
          inventarioPorCodigo.set(row.item_code, inv);
        }
      }

      const tareas = rows
        .map((row) => {
          const variante = varianteByCodigo.get(row.item_code);
          if (variante == null) return null;
          return { row, variante };
        })
        .filter(
          (x): x is { row: StockRow; variante: VarianteStockRow } => x != null
        );

      await runPool(tareas, getDbWriteConcurrency(), async ({ row, variante }) => {
        const stockFisico = Number(row.stock ?? 0);
        const reservado = reservasPorProductoWebId?.get(variante.id);
        const stock =
          reservasPorProductoWebId != null
            ? computeStockCacheConReservas(stockFisico, reservado)
            : stockFisico;
        const saleRaw = row.sale_price != null ? Number(row.sale_price) : null;
        const saleOk =
          saleRaw != null && !Number.isNaN(saleRaw) && saleRaw > 0
            ? saleRaw
            : null;

        const decision = shouldUpdateStockPrecio(
          { stockCache: variante.stockCache, precioCache: variante.precioCache },
          { stock, saleOk }
        );
        if (decision.skip) {
          acc.variantesOmitidas++;
          return;
        }

        const updateData: Prisma.ProductoWebUpdateInput = {
          ultimaSyncSfactory: new Date(),
        };
        if (decision.updateStock) {
          updateData.stockCache = new Prisma.Decimal(stock);
        }
        if (decision.updatePrecio && saleOk != null) {
          updateData.precioCache = new Prisma.Decimal(saleOk);
        }

        await prisma.productoWeb.update({
          where: { id: variante.id },
          data: updateData,
        });

        if (decision.updatePrecio && saleOk != null) {
          await productoPrecioService.upsert({
            productoWebId: variante.id,
            tipoCliente: 'minorista',
            precioLista: saleOk,
          });
          acc.preciosActualizados++;
        }

        acc.variantesActualizadas++;
      });
    }
  }

  /**
   * Actualiza stock/precio solo para los códigos indicados (p. ej. ítems de un pedido).
   * No ejecuta purge masivo de activoSfactory.
   */
  async syncStockPreciosPorCodigos(
    empresaId: number,
    codigosInput: string[],
    warehouseId?: number
  ): Promise<StockPreciosSyncResult> {
    const wid = warehouseId ?? getEcommerceWarehouseId();
    const codigos = [...new Set(codigosInput.map((c) => c.trim()).filter(Boolean))];
    if (codigos.length === 0) {
      return emptyStockPreciosResult(wid);
    }

    const variantes = await prisma.productoWeb.findMany({
      where: {
        empresaId,
        sfactoryCodigo: { in: codigos },
      },
      select: {
        id: true,
        sfactoryCodigo: true,
        stockCache: true,
        precioCache: true,
      },
    });

    const varianteByCodigo = new Map(variantes.map((v) => [v.sfactoryCodigo, v]));
    const reservas = await getReservasActivasPorProductoWebId(
      empresaId,
      variantes.map((v) => v.id)
    );
    const acc: BatchSyncAccum = {
      variantesActualizadas: 0,
      variantesOmitidas: 0,
      preciosActualizados: 0,
      lotes: 0,
      llamadasApi: 0,
      codigosOmitidos: [],
    };

    await this.syncVariantesStockFromSfactory(wid, codigos, varianteByCodigo, acc, undefined, reservas);

    if (acc.variantesActualizadas === 0 && codigos.length > 0) {
      console.warn(
        '[StockPreciosSync] sync parcial: 0 variantes actualizadas para',
        codigos.length,
        'código(s). Depósito:',
        wid
      );
    }

    return {
      warehouseId: wid,
      codigosConsultados: codigos.length,
      variantesActualizadas: acc.variantesActualizadas,
      variantesOmitidas: acc.variantesOmitidas,
      preciosActualizados: acc.preciosActualizados,
      lotes: acc.lotes,
      llamadasApi: acc.llamadasApi,
      codigosOmitidos: acc.codigosOmitidos,
      variantesDesactivadas: 0,
      variantesActivadas: 0,
      padresDespublicados: 0,
    };
  }

  /**
   * Actualiza stock (y precio minorista si sale_price > 0) desde el depósito ecommerce
   * para variantes de rubros WORKWEAR + OFFICE.
   */
  async syncStockPreciosPorDepositoEcommerce(
    empresaId: number,
    warehouseId?: number
  ): Promise<StockPreciosSyncResult> {
    const wid = warehouseId ?? getEcommerceWarehouseId();

    const rubros = await prisma.rubro.findMany({
      where: {
        empresaId,
        sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS },
      },
      select: { id: true },
    });
    const rubroIds = rubros.map((r) => r.id);
    if (rubroIds.length === 0) {
      throw new Error(
        'No hay rubros ecommerce (WORKWEAR/OFFICE) para esta empresa. Sincronizá rubros primero.'
      );
    }

    const variantes = await prisma.productoWeb.findMany({
      where: {
        empresaId,
        productoPadre: { rubroId: { in: rubroIds } },
      },
      select: {
        id: true,
        sfactoryCodigo: true,
        stockCache: true,
        precioCache: true,
        activoSfactory: true,
      },
    });

    const codigos = variantes.map((v) => v.sfactoryCodigo).filter(Boolean);
    const varianteByCodigo = new Map(variantes.map((v) => [v.sfactoryCodigo, v]));

    const acc: BatchSyncAccum = {
      variantesActualizadas: 0,
      variantesOmitidas: 0,
      preciosActualizados: 0,
      lotes: 0,
      llamadasApi: 0,
      codigosOmitidos: [],
    };
    const inventarioPorCodigo = new Map<string, InventarioDepositoRow>();
    for (const c of codigos) {
      inventarioPorCodigo.set(c, { stock: 0, salePrice: null });
    }

    const reservas = await getReservasActivasPorProductoWebId(
      empresaId,
      variantes.map((v) => v.id)
    );

    await this.syncVariantesStockFromSfactory(
      wid,
      codigos,
      varianteByCodigo,
      acc,
      inventarioPorCodigo,
      reservas
    );

    const {
      variantesActualizadas,
      variantesOmitidas,
      preciosActualizados,
      lotes,
      llamadasApi,
      codigosOmitidos,
    } = acc;

    if (variantesActualizadas === 0 && codigos.length > 0) {
      console.warn(
        '[StockPreciosSync] 0 variantes actualizadas con',
        codigos.length,
        'códigos consultados y',
        lotes,
        'lote(s). Depósito:',
        wid
      );
    }
    if (variantesActualizadas === 0 && codigos.length === 0) {
      console.warn(
        '[StockPreciosSync] Sin variantes ecommerce (rubros WORKWEAR/OFFICE activas). empresaId:',
        empresaId
      );
    }
    if (codigosOmitidos.length > 0) {
      console.warn(
        '[StockPreciosSync] Códigos omitidos (no existen en S-Factory):',
        codigosOmitidos.join(', ')
      );
    }

    const purge = await this.desactivarVariantesFueraDepositoEcommerce(empresaId, {
      warehouseId: wid,
      rubroIds,
      inventarioPrecargado: inventarioPorCodigo,
      codigosOmitidosAcumulados: codigosOmitidos,
      despublicarPadresSinVendibles:
        process.env.SYNC_DESPUBLICAR_PADRES_SIN_VENDIBLES === 'true',
    });

    return {
      warehouseId: wid,
      codigosConsultados: codigos.length,
      variantesActualizadas,
      variantesOmitidas,
      preciosActualizados,
      lotes,
      llamadasApi,
      codigosOmitidos,
      variantesDesactivadas: purge.variantesDesactivadas,
      variantesActivadas: purge.variantesActivadas,
      padresDespublicados: purge.padresDespublicados,
    };
  }

  /**
   * Alinea activoSfactory con inventario del depósito ecommerce (por código, no por grupo).
   */
  async desactivarVariantesFueraDepositoEcommerce(
    empresaId: number,
    options?: {
      warehouseId?: number;
      rubroIds?: number[];
      inventarioPrecargado?: Map<string, InventarioDepositoRow> | null;
      codigosOmitidosAcumulados?: string[];
      despublicarPadresSinVendibles?: boolean;
    }
  ): Promise<DesactivarFueraDepositoResult> {
    const wid = options?.warehouseId ?? getEcommerceWarehouseId();

    let rubroIds = options?.rubroIds;
    if (!rubroIds || rubroIds.length === 0) {
      const rubros = await prisma.rubro.findMany({
        where: {
          empresaId,
          sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS },
        },
        select: { id: true },
      });
      rubroIds = rubros.map((r) => r.id);
    }
    if (rubroIds.length === 0) {
      return {
        variantesDesactivadas: 0,
        variantesActivadas: 0,
        padresDespublicados: 0,
        codigosOmitidos: options?.codigosOmitidosAcumulados ?? [],
        publicadosSublinea: 0,
        coloresPadresRefrescados: 0,
      };
    }

    const variantes = await prisma.productoWeb.findMany({
      where: {
        empresaId,
        productoPadre: { rubroId: { in: rubroIds } },
      },
      select: {
        id: true,
        sfactoryCodigo: true,
        activoSfactory: true,
        color: true,
        productoPadre: { select: { codigoAgrupacion: true } },
      },
    });

    const codigos = variantes.map((v) => v.sfactoryCodigo).filter(Boolean);
    const codigosOmitidos = [...(options?.codigosOmitidosAcumulados ?? [])];
    let inventario = options?.inventarioPrecargado ?? null;
    if (!inventario) {
      if (codigos.length > 0) {
        const inv = await obtenerInventarioPorCodigos(codigos, wid);
        inventario = inv.inventarioPorCodigo;
        for (const c of inv.codigosOmitidos) {
          if (!codigosOmitidos.includes(c)) codigosOmitidos.push(c);
        }
      } else {
        inventario = new Map<string, InventarioDepositoRow>();
      }
    }

    const omitSet = new Set(codigosOmitidos);
    let variantesDesactivadas = 0;
    let variantesActivadas = 0;

    await runPool(variantes, getDbWriteConcurrency(), async (v) => {
      const codigo = v.sfactoryCodigo;
      const activoDeposito =
        !omitSet.has(codigo) && activoSfactoryDesdeDeposito(codigo, inventario);
      const debeActivo = activoSfactoryConWhitelist(
        v.productoPadre.codigoAgrupacion,
        v.color,
        activoDeposito
      );
      if (debeActivo === v.activoSfactory) return;
      await prisma.productoWeb.update({
        where: { id: v.id },
        data: { activoSfactory: debeActivo },
      });
      if (debeActivo) variantesActivadas++;
      else variantesDesactivadas++;
    });

    let padresDespublicados = 0;
    if (options?.despublicarPadresSinVendibles) {
      const padresPublicados = await prisma.productoPadre.findMany({
        where: {
          empresaId,
          publicado: true,
          rubroId: { in: rubroIds },
        },
        select: {
          id: true,
          productosWeb: {
            where: { activoSfactory: true },
            select: { stockCache: true, precioCache: true },
          },
        },
      });
      const idsSinVendibles = padresPublicados
        .filter((p) => {
          const vendible = p.productosWeb.some(
            (w) => Number(w.stockCache ?? 0) > 0 && Number(w.precioCache ?? 0) > 0
          );
          return !vendible;
        })
        .map((p) => p.id);
      if (idsSinVendibles.length > 0) {
        const res = await prisma.productoPadre.updateMany({
          where: { id: { in: idsSinVendibles } },
          data: { publicado: false },
        });
        padresDespublicados = res.count;
      }
    }

    const publicadosSublinea = await publicarPadresSublineaAlineados(prisma, empresaId);
    const coloresPadres = await refrescarColoresDisponiblesPadres(
      prisma,
      empresaId,
      rubroIds
    );

    return {
      variantesDesactivadas,
      variantesActivadas,
      padresDespublicados,
      codigosOmitidos,
      publicadosSublinea: publicadosSublinea.publicados,
      coloresPadresRefrescados: coloresPadres.padresActualizados,
    };
  }
}

export const stockPreciosSyncService = new StockPreciosSyncService();
