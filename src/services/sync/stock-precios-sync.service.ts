import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../../config/precios.config';
import { getDbWriteConcurrency } from '../../lib/db-config';
import { shouldUpdateStockPrecio } from '../../utils/sync-hash.utils';
import {
  fetchStockRowsResilient,
  getEcommerceWarehouseId,
  STOCK_BATCH_CODES,
  type StockRow,
} from '../../utils/sfactory-stock-fetch.utils';

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

export class StockPreciosSyncService {
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
        activoSfactory: true,
        productoPadre: { rubroId: { in: rubroIds } },
      },
      select: { id: true, sfactoryCodigo: true, stockCache: true, precioCache: true },
    });

    const codigos = variantes.map((v) => v.sfactoryCodigo).filter(Boolean);
    const varianteByCodigo = new Map(variantes.map((v) => [v.sfactoryCodigo, v]));

    let variantesActualizadas = 0;
    let variantesOmitidas = 0;
    let preciosActualizados = 0;
    let lotes = 0;
    let llamadasApi = 0;
    const codigosOmitidos: string[] = [];

    for (let i = 0; i < codigos.length; i += BATCH_CODES) {
      const chunk = codigos.slice(i, i + BATCH_CODES);
      lotes++;

      const { rows, apiCalls: calls } = await fetchStockRowsResilient(
        wid,
        chunk,
        codigosOmitidos
      );
      llamadasApi += calls;

      const tareas = rows
        .map((row) => {
          const variante = varianteByCodigo.get(row.item_code);
          if (variante == null) return null;
          return { row, variante };
        })
        .filter(
          (x): x is { row: StockRow; variante: (typeof variantes)[number] } => x != null
        );

      await runPool(tareas, getDbWriteConcurrency(), async ({ row, variante }) => {
        const stock = Number(row.stock ?? 0);
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
          variantesOmitidas++;
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
          const preciosDerivados = calcularTodosLosPrecios(
            saleOk,
            CUOTAS_FINANCIADO_DEFAULT
          );
          await prisma.productoPrecio.upsert({
            where: {
              unique_producto_tipo: {
                productoWebId: variante.id,
                tipoCliente: 'minorista',
              },
            },
            create: {
              productoWebId: variante.id,
              tipoCliente: 'minorista',
              precioLista: new Prisma.Decimal(saleOk),
              precio: new Prisma.Decimal(saleOk),
              precioTransfer: new Prisma.Decimal(preciosDerivados.precioTransfer),
              precioFinanciado: new Prisma.Decimal(
                preciosDerivados.precioFinanciado
              ),
              cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
              precioSinImp: new Prisma.Decimal(preciosDerivados.precioSinImp),
            },
            update: {
              precioLista: new Prisma.Decimal(saleOk),
              precio: new Prisma.Decimal(saleOk),
              precioTransfer: new Prisma.Decimal(preciosDerivados.precioTransfer),
              precioFinanciado: new Prisma.Decimal(
                preciosDerivados.precioFinanciado
              ),
              cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
              precioSinImp: new Prisma.Decimal(preciosDerivados.precioSinImp),
            },
          });
          preciosActualizados++;
        }

        variantesActualizadas++;
      });
    }

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

    return {
      warehouseId: wid,
      codigosConsultados: codigos.length,
      variantesActualizadas,
      variantesOmitidas,
      preciosActualizados,
      lotes,
      llamadasApi,
      codigosOmitidos,
    };
  }
}

export const stockPreciosSyncService = new StockPreciosSyncService();
