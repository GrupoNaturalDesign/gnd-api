import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import {
  extractMissingItemCodeFromError,
  isSFactoryMissingItemError,
} from '../../lib/sfactory-stock-errors';
import { sfactoryService } from '../sfactory/sfactory.service';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../../config/precios.config';

/** Códigos por request a S-Factory (evitar payloads enormes). */
const BATCH_CODES = 80;

/** Concurrencia al persistir en BD (evitar saturar el pool). */
const DB_CONCURRENCY = 15;

type StockRow = {
  item_code: string;
  stock?: number;
  sale_price?: number;
};

export interface StockPreciosSyncResult {
  warehouseId: number;
  codigosConsultados: number;
  variantesActualizadas: number;
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

/**
 * Consulta stock para un lote de códigos. Si S-Factory rechaza por un código inexistente,
 * lo saca del lote y reintenta hasta agotar errores de ese tipo.
 */
async function fetchStockRowsResilient(
  warehouseId: number,
  items: string[],
  codigosOmitidos: string[]
): Promise<{ rows: StockRow[]; apiCalls: number }> {
  const working = [...new Set(items.filter(Boolean))];
  const allRows: StockRow[] = [];
  let apiCalls = 0;
  const maxIterations = working.length + 20;

  let current = working;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (current.length === 0) {
      return { rows: allRows, apiCalls };
    }

    try {
      apiCalls++;
      const res = await sfactoryService.stockItemsByWarehouseV2({
        warehouse_id: warehouseId,
        all_items: false,
        field: 'code',
        items: current,
      });
      const rows = Array.isArray(res?.data) ? res.data : [];
      allRows.push(...rows);
      return { rows: allRows, apiCalls };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const badCode = isSFactoryMissingItemError(e)
        ? e.missingItemCode
        : extractMissingItemCodeFromError(msg);
      if (badCode && current.includes(badCode)) {
        if (!codigosOmitidos.includes(badCode)) {
          codigosOmitidos.push(badCode);
        }
        current = current.filter((c) => c !== badCode);
        continue;
      }
      throw e;
    }
  }

  return { rows: allRows, apiCalls };
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
    const wid =
      warehouseId ?? Number(process.env.SFACTORY_WAREHOUSE_ID_ECOM || 0);
    if (!wid || Number.isNaN(wid)) {
      throw new Error(
        'Definí SFACTORY_WAREHOUSE_ID_ECOM en el servidor o pasá warehouseId en el body.'
      );
    }

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
      select: { id: true, sfactoryCodigo: true },
    });

    const codigos = variantes.map((v) => v.sfactoryCodigo).filter(Boolean);
    const idByCodigo = new Map(variantes.map((v) => [v.sfactoryCodigo, v.id]));

    let variantesActualizadas = 0;
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
          const pwId = idByCodigo.get(row.item_code);
          if (pwId == null) return null;
          return { row, pwId };
        })
        .filter(
          (x): x is { row: StockRow; pwId: number } => x != null
        );

      await runPool(tareas, DB_CONCURRENCY, async ({ row, pwId }) => {
        const stock = Number(row.stock ?? 0);
        const saleRaw = row.sale_price != null ? Number(row.sale_price) : null;
        const saleOk =
          saleRaw != null && !Number.isNaN(saleRaw) && saleRaw > 0
            ? saleRaw
            : null;

        await prisma.productoWeb.update({
          where: { id: pwId },
          data: {
            stockCache: new Prisma.Decimal(stock),
            ultimaSyncSfactory: new Date(),
            ...(saleOk != null
              ? { precioCache: new Prisma.Decimal(saleOk) }
              : {}),
          },
        });

        if (saleOk != null) {
          const preciosDerivados = calcularTodosLosPrecios(
            saleOk,
            CUOTAS_FINANCIADO_DEFAULT
          );
          await prisma.productoPrecio.upsert({
            where: {
              unique_producto_tipo: {
                productoWebId: pwId,
                tipoCliente: 'minorista',
              },
            },
            create: {
              productoWebId: pwId,
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
        }
      });

      variantesActualizadas += tareas.length;
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
      lotes,
      llamadasApi,
      codigosOmitidos,
    };
  }
}

export const stockPreciosSyncService = new StockPreciosSyncService();
