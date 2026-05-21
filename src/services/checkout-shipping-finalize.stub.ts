/**
 * FASE 3 — Orquestación post-pago (NO IMPLEMENTADA).
 *
 * Cuando el flujo esté probado por separado (webhook MP, creación de pedido, cotización, `createOrder`),
 * aquí se unificará algo equivalente a:
 *
 * 1. Confirmar pago (`procesarPedidoConfirmado` / webhook).
 * 2. Leer `pedido.checkoutEnvioSnapshot` (JSON v1).
 * 3. Armar `CreateShippingOrderInput` y llamar `shippingService.createOrder`.
 * 4. Reintentos / `PedidoEnvioLog` / estado `envío pendiente` si falla el carrier.
 *
 * Hoy **no** se invoca desde el webhook para permitir pruebas unitarias aisladas.
 */
export async function finalizeShippingAfterPaymentApproved(_pedidoId: number): Promise<void> {
  void _pedidoId;
}
