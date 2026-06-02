/**
 * Códigos de estado PE (Orden Pedido) en S-Factory.
 * Solo se usan env para estados que GND escribe con ventas_editar_orden_pedido.
 * Referencia tenant: 1 Cotización, 2 Aprobado, 3 Terminado, 4 Cancelado, 5 En curso, 6 A entregar.
 */
export const SFACTORY_PE_ESTADO = {
  cotizacion: process.env.SFACTORY_ORDEN_ESTADO_COTIZACION ?? '1',
  aprobado: process.env.SFACTORY_ORDEN_ESTADO_APROBADO ?? '2',
  cancelado: process.env.SFACTORY_ORDEN_ESTADO_CANCELADO ?? '4',
} as const;

export type SfactoryPeEstadoCodigo =
  (typeof SFACTORY_PE_ESTADO)[keyof typeof SFACTORY_PE_ESTADO];
