import { FormaPago } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../lib/email/email.service';
import { formatArs } from '../lib/money-format';
import { getCheckoutEmpresaIdFromEnv } from '../lib/checkout-empresa';
import {
  empresaDatosBancariosService,
  type DatosBancariosPublic,
} from './empresa-datos-bancarios.service';
import {
  empresaTiendaConfigService,
  getDefaultWhatsappPhone,
} from './empresa-tienda-config.service';
import { buildManualPaymentNextSteps } from '../lib/manual-payment-copy';
import type { ManualPaymentInstructionsEmailProps } from '../emails/ManualPaymentInstructionsEmail';

function formaPagoToManual(
  forma: FormaPago | null | undefined
): 'transferencia' | 'efectivo' | null {
  if (forma === FormaPago.transferencia) return 'transferencia';
  if (forma === FormaPago.efectivo) return 'efectivo';
  return null;
}

function formatExpiresAt(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function buildManualPaymentInstructionsPayload(
  pedidoId: number
): Promise<ManualPaymentInstructionsEmailProps | null> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedido?.clienteEmail?.trim()) return null;

  const formaPago = formaPagoToManual(pedido.formaPago);
  if (!formaPago) return null;

  const descuento = Number(pedido.descuento);
  const totalNeto = Number(pedido.total) - descuento;

  let bank: DatosBancariosPublic | null = null;
  if (formaPago === 'transferencia') {
    bank = await empresaDatosBancariosService.getDatosBancariosPublic(pedido.empresaId);
  }

  const tienda = await empresaTiendaConfigService.getTiendaConfigPublic(pedido.empresaId);
  const externalOrderId = `WEB-${pedido.id}`;
  const nextSteps = buildManualPaymentNextSteps(
    formaPago,
    tienda,
    externalOrderId,
    getDefaultWhatsappPhone(),
    formaPago !== 'transferencia' || bank != null
  );

  const facturacion =
    pedido.necesitaFactura &&
    pedido.facturaTipo &&
    pedido.facturaCuit &&
    pedido.facturaRazonSocial
      ? {
          tipo: pedido.facturaTipo as 'A' | 'C',
          cuit: pedido.facturaCuit,
          razonSocial: pedido.facturaRazonSocial,
        }
      : undefined;

  return {
    customerEmail: pedido.clienteEmail.trim(),
    customerName: pedido.clienteNombre,
    orderId: pedido.id,
    externalOrderId,
    formaPago,
    totalFormatted: formatArs(totalNeto >= 0 ? totalNeto : Number(pedido.total)),
    expiresAtFormatted: formatExpiresAt(pedido.expiresAt),
    bank,
    nextSteps,
    facturacion,
    items: pedido.items.map((it) => {
      const espec = [it.talle, it.color].filter(Boolean).join(' / ');
      return {
        nombre: it.nombre,
        cantidad: Number(it.cantidad),
        subtotalFormatted: formatArs(Number(it.subtotal)),
        ...(espec ? { especificaciones: espec } : {}),
      };
    }),
  };
}

export async function sendManualPaymentInstructionsEmail(pedidoId: number): Promise<void> {
  const payload = await buildManualPaymentInstructionsPayload(pedidoId);
  if (!payload) return;
  const result = await emailService.sendManualPaymentInstructionsEmail(payload);
  if (!result.success) {
    console.error(
      `[pedido-payment-instructions] Falló email pedido ${pedidoId}:`,
      result.error
    );
  }
}

export function sendManualPaymentInstructionsEmailAsync(pedidoId: number): void {
  void sendManualPaymentInstructionsEmail(pedidoId);
}

export interface InstruccionesPagoResponse {
  pedidoId: number;
  externalOrderId: string;
  formaPago: 'transferencia' | 'efectivo';
  totalFormatted: string;
  expiresAt: string | null;
  customerEmail: string;
  customerName: string;
  bank: DatosBancariosPublic | null;
  bankConfigured: boolean;
}

export async function getInstruccionesPagoForPedido(
  pedidoId: number,
  usuarioId: number
): Promise<InstruccionesPagoResponse | null> {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, usuarioId },
    include: { items: true },
  });
  if (!pedido) return null;

  const formaPago = formaPagoToManual(pedido.formaPago);
  if (!formaPago) return null;

  const empresaId = pedido.empresaId ?? getCheckoutEmpresaIdFromEnv();
  const bank =
    formaPago === 'transferencia'
      ? await empresaDatosBancariosService.getDatosBancariosPublic(empresaId)
      : null;

  const descuento = Number(pedido.descuento);
  const totalNeto = Number(pedido.total) - descuento;

  return {
    pedidoId: pedido.id,
    externalOrderId: `WEB-${pedido.id}`,
    formaPago,
    totalFormatted: formatArs(totalNeto >= 0 ? totalNeto : Number(pedido.total)),
    expiresAt: pedido.expiresAt?.toISOString() ?? null,
    customerEmail: pedido.clienteEmail,
    customerName: pedido.clienteNombre,
    bank,
    bankConfigured: formaPago !== 'transferencia' || bank != null,
  };
}
