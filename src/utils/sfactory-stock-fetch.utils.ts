import {
  extractMissingItemCodeFromError,
  isSFactoryMissingItemError,
} from '../lib/sfactory-stock-errors';
import { sfactoryService } from '../services/sfactory/sfactory.service';
import type { ProductoAgrupado } from '../services/producto-agrupacion.service';

export const STOCK_BATCH_CODES = 80;

export type StockRow = {
  item_code: string;
  stock?: number;
  sale_price?: number;
};

export function getEcommerceWarehouseId(): number {
  const wid = Number(process.env.SFACTORY_WAREHOUSE_ID_ECOM || 0);
  if (!wid || Number.isNaN(wid)) {
    throw new Error(
      'Definí SFACTORY_WAREHOUSE_ID_ECOM para filtrar/sincronizar stock del depósito ecommerce.'
    );
  }
  return wid;
}

export function codigoDesdeItemSfactory(producto: {
  Codigo?: string;
  codigo?: string;
}): string {
  return String(producto.Codigo || producto.codigo || '').trim();
}

/**
 * Consulta stock por lote. Códigos sin fila en la respuesta quedan en 0.
 */
export async function fetchStockRowsResilient(
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

export async function obtenerStockPorCodigos(
  codigos: string[],
  warehouseId?: number
): Promise<{
  stockPorCodigo: Map<string, number>;
  llamadasApi: number;
  codigosOmitidos: string[];
}> {
  const wid = warehouseId ?? getEcommerceWarehouseId();
  const unicos = [...new Set(codigos.filter(Boolean))];
  const stockPorCodigo = new Map<string, number>();
  for (const c of unicos) {
    stockPorCodigo.set(c, 0);
  }

  const codigosOmitidos: string[] = [];
  let llamadasApi = 0;

  for (let i = 0; i < unicos.length; i += STOCK_BATCH_CODES) {
    const chunk = unicos.slice(i, i + STOCK_BATCH_CODES);
    const { rows, apiCalls } = await fetchStockRowsResilient(wid, chunk, codigosOmitidos);
    llamadasApi += apiCalls;
    for (const row of rows) {
      stockPorCodigo.set(row.item_code, Number(row.stock ?? 0));
    }
  }

  return { stockPorCodigo, llamadasApi, codigosOmitidos };
}

/**
 * Si al menos una variante del grupo tiene stock > 0, se incluyen todos los SKUs del grupo.
 */
export function resolverGruposConStock(
  grupos: Map<string, ProductoAgrupado>,
  stockPorCodigo: Map<string, number>
): {
  codigosPermitidos: Set<string>;
  clavesGrupoConStock: Set<string>;
  gruposSinStock: number;
  variantesEnGruposConStock: number;
} {
  const codigosPermitidos = new Set<string>();
  const clavesGrupoConStock = new Set<string>();
  let gruposSinStock = 0;
  let variantesEnGruposConStock = 0;

  for (const [clave, grupo] of grupos) {
    const tieneStockGrupo = grupo.productos.some(({ producto }) => {
      const codigo = codigoDesdeItemSfactory(producto as { Codigo?: string; codigo?: string });
      return (stockPorCodigo.get(codigo) ?? 0) > 0;
    });

    if (!tieneStockGrupo) {
      gruposSinStock++;
      continue;
    }

    clavesGrupoConStock.add(clave);
    for (const item of grupo.productos) {
      const codigo = codigoDesdeItemSfactory(
        item.producto as { Codigo?: string; codigo?: string }
      );
      if (codigo) {
        codigosPermitidos.add(codigo);
        variantesEnGruposConStock++;
      }
    }
  }

  return {
    codigosPermitidos,
    clavesGrupoConStock,
    gruposSinStock,
    variantesEnGruposConStock,
  };
}
