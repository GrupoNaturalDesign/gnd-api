export type StockSyncMessageInput = {
  mode?: 'initial' | 'incremental';
  warehouseId: number;
  rowsReceived?: number;
  variantesActualizadas: number;
  variantesOmitidas: number;
  llamadasApi: number;
  skippedDueToLock?: boolean;
};

/** Copy de API/admin: un delta vacío es éxito, no ausencia de catálogo. */
export function buildStockSyncMessage(data: StockSyncMessageInput): string {
  if (data.skippedDueToLock) {
    return 'La sincronización de stock ya estaba en curso; no se inició otra consulta.';
  }
  if (data.mode === 'initial') {
    return `Inventario inicial cargado: ${data.rowsReceived ?? 0} ítems del depósito ${data.warehouseId} en ${data.llamadasApi} llamada API.`;
  }
  if (data.mode === 'incremental' && (data.rowsReceived ?? 0) === 0) {
    return `Stock al día: no hubo cambios en el depósito ${data.warehouseId}.`;
  }
  if (data.mode === 'incremental') {
    return `Stock incremental actualizado: ${data.rowsReceived ?? 0} cambio(s), ${data.variantesActualizadas} variante(s) aplicada(s), 1 llamada API.`;
  }
  return `Stock y precios actualizados desde S-Factory: ${data.variantesActualizadas} variante(s).`;
}
