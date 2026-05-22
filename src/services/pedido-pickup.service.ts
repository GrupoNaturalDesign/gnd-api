import { EstadoPedido, OrderStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  buildStorePickupReadyInstructions,
  formatPedidoNumero,
} from '../lib/store-pickup.config';
import { sendPedidoStatusEmail } from './pedido-email-notification.service';
import {
  validateEnviarListoParaRetiro,
  validateMarcarPedidoRetirado,
} from './pedido-pickup.rules';

async function getPedidoForEmpresa(empresaId: number, pedidoId: number) {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId },
  });
  if (!pedido) throw new Error('Pedido no encontrado');
  return pedido;
}

/** Admin: avisa al cliente que el pedido está listo para retirar. */
export async function enviarListoParaRetiro(empresaId: number, pedidoId: number) {
  const pedido = await getPedidoForEmpresa(empresaId, pedidoId);
  validateEnviarListoParaRetiro(pedido);

  const orderRef = formatPedidoNumero(pedido.id, pedido.sfactoryExternalOrderId);
  await sendPedidoStatusEmail(pedidoId, OrderStatus.IN_PROCESS, {
    sendInternal: false,
    statusUiOverrides: {
      title: 'Listo para retirar',
      lead: buildStorePickupReadyInstructions(orderRef),
      icon: '📍',
      bannerBg: '#1B5E20',
    },
    deliveryInstructions: buildStorePickupReadyInstructions(orderRef),
  });

  return { ok: true as const, pedidoId };
}

/** Admin: marca retiro en tienda como entregado y envía email breve al cliente. */
export async function marcarPedidoRetirado(
  empresaId: number,
  pedidoId: number,
  options?: { sendEmail?: boolean }
) {
  const pedido = await getPedidoForEmpresa(empresaId, pedidoId);
  const validation = validateMarcarPedidoRetirado(pedido);

  if (validation.alreadyDelivered) {
    return { ok: true as const, pedidoId, alreadyDelivered: true as const };
  }

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: { estadoInterno: EstadoPedido.entregado },
  });

  if (options?.sendEmail !== false) {
    await sendPedidoStatusEmail(pedidoId, OrderStatus.DELIVERED, {
      sendInternal: false,
      statusUiOverrides: {
        lead: 'Registramos que retiraste tu pedido. ¡Gracias por elegirnos!',
      },
    });
  }

  return { ok: true as const, pedidoId };
}

export const pedidoPickupService = {
  enviarListoParaRetiro,
  marcarPedidoRetirado,
};
