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

export type InventarioDepositoRow = {
  stock: number;
  salePrice: number | null;
};

const SKU_MARCADOR_SUFFIX = /_(D|H|U)$/;

/** SKU de agrupación por sexo (_D/_H/_U), no variante de venta salvo precio en depósito. */
export function esSkuMarcadorEcommerce(codigo: string): boolean {
  return SKU_MARCADOR_SUFFIX.test(String(codigo || '').trim());
}

export function salePriceDesdeRow(row: StockRow): number | null {
  const saleRaw = row.sale_price != null ? Number(row.sale_price) : null;
  if (saleRaw == null || Number.isNaN(saleRaw) || saleRaw <= 0) return null;
  return saleRaw;
}

/** Vendible en depósito ecommerce: stock > 0 o precio minorista del depósito > 0. */
export function codigoVendibleEnDeposito(row: InventarioDepositoRow): boolean {
  return row.stock > 0 || row.salePrice != null;
}

export function inventarioDesdeStockRow(row: StockRow): InventarioDepositoRow {
  return {
    stock: Number(row.stock ?? 0),
    salePrice: salePriceDesdeRow(row),
  };
}

export function activoSfactoryDesdeDeposito(
  codigo: string,
  inventario: Map<string, InventarioDepositoRow>
): boolean {
  const row = inventario.get(codigo);
  if (!row || !codigoVendibleEnDeposito(row)) return false;
  if (esSkuMarcadorEcommerce(codigo) && row.salePrice == null) return false;
  return true;
}

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

export async function obtenerInventarioPorCodigos(
  codigos: string[],
  warehouseId?: number
): Promise<{
  inventarioPorCodigo: Map<string, InventarioDepositoRow>;
  llamadasApi: number;
  codigosOmitidos: string[];
}> {
  const wid = warehouseId ?? getEcommerceWarehouseId();
  const unicos = [...new Set(codigos.filter(Boolean))];
  const inventarioPorCodigo = new Map<string, InventarioDepositoRow>();
  for (const c of unicos) {
    inventarioPorCodigo.set(c, { stock: 0, salePrice: null });
  }

  const codigosOmitidos: string[] = [];
  let llamadasApi = 0;

  for (let i = 0; i < unicos.length; i += STOCK_BATCH_CODES) {
    const chunk = unicos.slice(i, i + STOCK_BATCH_CODES);
    const { rows, apiCalls } = await fetchStockRowsResilient(wid, chunk, codigosOmitidos);
    llamadasApi += apiCalls;
    for (const row of rows) {
      inventarioPorCodigo.set(row.item_code, inventarioDesdeStockRow(row));
    }
  }

  return { inventarioPorCodigo, llamadasApi, codigosOmitidos };
}

/** @deprecated Usar obtenerInventarioPorCodigos; mantiene compatibilidad de tests legacy. */
export async function obtenerStockPorCodigos(
  codigos: string[],
  warehouseId?: number
): Promise<{
  stockPorCodigo: Map<string, number>;
  llamadasApi: number;
  codigosOmitidos: string[];
}> {
  const { inventarioPorCodigo, llamadasApi, codigosOmitidos } =
    await obtenerInventarioPorCodigos(codigos, warehouseId);
  const stockPorCodigo = new Map<string, number>();
  for (const [codigo, row] of inventarioPorCodigo) {
    stockPorCodigo.set(codigo, row.stock);
  }
  return { stockPorCodigo, llamadasApi, codigosOmitidos };
}

/**
 * Códigos con presencia vendible en depósito (por ítem, no por grupo).
 * Un grupo puede procesarse si al menos un código suyo está en el set.
 */
export function resolverCodigosPermitidosDeposito(
  grupos: Map<string, ProductoAgrupado>,
  inventarioPorCodigo: Map<string, InventarioDepositoRow>
): {
  codigosPermitidos: Set<string>;
  clavesGrupoConStock: Set<string>;
  gruposSinStock: number;
  variantesEnDeposito: number;
} {
  const codigosPermitidos = new Set<string>();
  const clavesGrupoConStock = new Set<string>();
  let gruposSinStock = 0;
  let variantesEnDeposito = 0;

  for (const [clave, grupo] of grupos) {
    let grupoTieneAlguno = false;
    for (const item of grupo.productos) {
      const codigo = codigoDesdeItemSfactory(
        item.producto as { Codigo?: string; codigo?: string }
      );
      if (!codigo) continue;
      const row = inventarioPorCodigo.get(codigo);
      if (!row || !codigoVendibleEnDeposito(row)) continue;
      if (esSkuMarcadorEcommerce(codigo) && row.salePrice == null) continue;
      codigosPermitidos.add(codigo);
      variantesEnDeposito++;
      grupoTieneAlguno = true;
    }
    if (grupoTieneAlguno) {
      clavesGrupoConStock.add(clave);
    } else {
      gruposSinStock++;
    }
  }

  return {
    codigosPermitidos,
    clavesGrupoConStock,
    gruposSinStock,
    variantesEnDeposito,
  };
}

/**
 * @deprecated Usar resolverCodigosPermitidosDeposito (por ítem, no arrastra el grupo entero).
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
