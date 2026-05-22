/** Dirección / punto de retiro en tienda (checkout y emails). */
export function getStorePickupAddress(): string {
  const fromEnv = process.env.STORE_PICKUP_ADDRESS?.trim();
  if (fromEnv) return fromEnv;
  return 'Alta Córdoba, Córdoba Capital.';
}

export function formatPedidoNumero(pedidoId: number, externalOrderId?: string | null): string {
  const ext = externalOrderId?.trim();
  if (ext) return ext;
  return `WEB-${pedidoId}`;
}

export function buildStorePickupReadyInstructions(orderRef: string): string {
  return [
    `Tu pedido ${orderRef} ya está listo para retirar.`,
    `Dirección: ${getStorePickupAddress()}`,
    'Presentá DNI y el número de pedido al retirar.',
  ].join(' ');
}

export function buildStorePickupConfirmInstructions(orderRef: string): string {
  return [
    `Pedido ${orderRef}.`,
    `Retiro en tienda: ${getStorePickupAddress()}`,
    'Te avisaremos por email cuando esté listo para retirar.',
    'Presentá DNI y el número de pedido al retirar.',
  ].join(' ');
}
