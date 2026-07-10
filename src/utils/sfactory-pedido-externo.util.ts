import type { SFactoryPedidoFulfillmentMode } from '../types/sfactory.types';

const FULFILLMENT_MODES: ReadonlySet<SFactoryPedidoFulfillmentMode> = new Set([
  'none',
  'reserve',
  'deliver',
]);

/**
 * Modo de cumplimiento para ventas_crear_pedido_externo.
 * Default `none`: el checkout web gestiona envío (Andreani/Correo) y no pide remito/reserva en SF.
 */
export function resolveSfactoryPedidoFulfillmentMode(): SFactoryPedidoFulfillmentMode {
  const raw = process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE?.trim().toLowerCase();
  if (raw && FULFILLMENT_MODES.has(raw as SFactoryPedidoFulfillmentMode)) {
    return raw as SFactoryPedidoFulfillmentMode;
  }
  return 'none';
}
