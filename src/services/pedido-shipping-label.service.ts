import prisma from '../lib/prisma';
import { PedidoLabelNotAvailableError } from './shipping/shipping.errors';
import { shippingService } from './shipping/shipping.service';
import {
  httpStatusForPedidoLabelReason,
  resolvePedidoLabelAvailability,
  type PedidoLabelAvailability,
} from '../utils/pedido-shipping-label.util';

const PEDIDO_LABEL_SELECT = {
  formaEnvio: true,
  checkoutEnvioSnapshot: true,
  andreaniNumeroEnvio: true,
  correoTrackingNumber: true,
  andreaniAgrupadorBultos: true,
  trackingUrl: true,
  costoEnvio: true,
  clienteDireccion: true,
  andreaniSucursalId: true,
  andreaniSucursalDescripcion: true,
  entregaCp: true,
} as const;

export interface PedidoLabelDownloadResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  trackingNumber: string;
}

export class PedidoShippingLabelService {
  async getAvailability(
    empresaId: number,
    pedidoId: number
  ): Promise<PedidoLabelAvailability> {
    const pedido = await prisma.pedido.findFirst({
      where: { id: pedidoId, empresaId },
      select: PEDIDO_LABEL_SELECT,
    });
    if (!pedido) {
      throw new PedidoLabelNotAvailableError(
        'Pedido no encontrado',
        'pedido_not_found',
        404
      );
    }
    return resolvePedidoLabelAvailability(pedido);
  }

  async downloadLabel(
    empresaId: number,
    pedidoId: number
  ): Promise<PedidoLabelDownloadResult> {
    const availability = await this.getAvailability(empresaId, pedidoId);
    if (!availability.canDownload) {
      throw new PedidoLabelNotAvailableError(
        availability.message,
        availability.reason,
        httpStatusForPedidoLabelReason(availability.reason)
      );
    }

    const trackingNumber = availability.trackingNumber!;
    const label = await shippingService.getLabel(
      pedidoId,
      trackingNumber,
      'andreani',
      empresaId
    );

    const contentType = label.fileName.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'application/pdf';

    return {
      buffer: Buffer.from(label.fileBase64, 'base64'),
      fileName: label.fileName,
      contentType,
      trackingNumber: label.trackingNumber,
    };
  }
}

export const pedidoShippingLabelService = new PedidoShippingLabelService();
