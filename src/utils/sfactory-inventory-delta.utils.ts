import type { InventarioDepositoRow } from './sfactory-stock-fetch.utils';

export const INVENTORY_CURSOR_OVERLAP_SECONDS = 120;
export const SFACTORY_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export type InventorySyncMode = 'initial' | 'incremental';

export type SfactoryInventoryChangedRow = {
  item_id?: number;
  item_code: string;
  stock?: number | string | null;
  sale_price?: number | string | null;
  warehouse_id?: number | string | null;
  updated_at?: string | null;
  changed_at?: string | null;
};

export type NormalizedInventoryChangedRow = InventarioDepositoRow & {
  itemCode: string;
  warehouseId: number | null;
  sourceUpdatedAt: Date | null;
};

function dateParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SFACTORY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Formato requerido por S-Factory: YYYY-MM-DD HH:mm:ss, hora Argentina. */
export function formatSfactoryChangedSince(date: Date): string {
  const p = dateParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Solapamiento deliberado: los upserts hacen seguro volver a recibir filas. */
export function cursorWithOverlap(
  cursorAt: Date,
  overlapSeconds: number = INVENTORY_CURSOR_OVERLAP_SECONDS
): Date {
  return new Date(cursorAt.getTime() - overlapSeconds * 1000);
}

export function buildInventoryChangedParameters(input: {
  warehouseId: number;
  cursorAt?: Date | null;
  overlapSeconds?: number;
}): {
  mode: InventorySyncMode;
  parameters:
    | { warehouse_id: number; all_items: true }
    | { warehouse_id: number; changed_since: string };
} {
  if (!input.cursorAt) {
    return {
      mode: 'initial',
      parameters: { warehouse_id: input.warehouseId, all_items: true },
    };
  }
  const since = cursorWithOverlap(input.cursorAt, input.overlapSeconds);
  return {
    mode: 'incremental',
    parameters: {
      warehouse_id: input.warehouseId,
      changed_since: formatSfactoryChangedSince(since),
    },
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Normaliza, filtra otro depósito y deduplica por código (gana la última fila). */
export function normalizeInventoryChangedRows(
  rows: SfactoryInventoryChangedRow[],
  requestedWarehouseId: number
): NormalizedInventoryChangedRow[] {
  const byCode = new Map<string, NormalizedInventoryChangedRow>();
  for (const row of rows) {
    const itemCode = String(row.item_code ?? '').trim();
    if (!itemCode) continue;
    const warehouseId = row.warehouse_id == null
      ? null
      : finiteNumber(row.warehouse_id, Number.NaN);
    if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId !== requestedWarehouseId) {
      continue;
    }
    const saleRaw = row.sale_price == null ? null : finiteNumber(row.sale_price, Number.NaN);
    byCode.set(itemCode, {
      itemCode,
      warehouseId: Number.isFinite(warehouseId) ? warehouseId : null,
      stock: finiteNumber(row.stock, 0),
      salePrice: saleRaw != null && Number.isFinite(saleRaw) && saleRaw > 0 ? saleRaw : null,
      sourceUpdatedAt: optionalDate(row.changed_at ?? row.updated_at),
    });
  }
  return [...byCode.values()];
}
