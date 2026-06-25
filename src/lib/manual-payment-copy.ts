import type { TiendaConfigPublic } from '../services/empresa-tienda-config.service';

export interface ManualPaymentCopyInput {
  emailPedidosInterno?: string | null;
  whatsappTelefono?: string;
  pagoManualHorasPlazo?: number;
  pagoManualInstruccionesExtra?: string | null;
}

export function buildProofContactPhrase(
  phone: string,
  emailPedidosInterno?: string | null
): string {
  const email = emailPedidosInterno?.trim();
  if (email) {
    return `por WhatsApp al ${phone} o por email a ${email}`;
  }
  return `por WhatsApp al ${phone}`;
}

export function buildTransferNextStepsMessage(
  tienda: ManualPaymentCopyInput,
  defaultPhone: string
): string {
  const phone = tienda.whatsappTelefono?.trim() || defaultPhone;
  const contact = buildProofContactPhrase(phone, tienda.emailPedidosInterno);
  const extra = tienda.pagoManualInstruccionesExtra?.trim();
  const base = `Enviá el comprobante de la transferencia ${contact}.`;
  return extra ? `${base} ${extra}` : base;
}

export function buildEfectivoNextStepsMessage(
  tienda: ManualPaymentCopyInput,
  defaultPhone: string,
  externalOrderId: string
): string {
  const phone = tienda.whatsappTelefono?.trim() || defaultPhone;
  const contact = buildProofContactPhrase(phone, tienda.emailPedidosInterno);
  const extra = tienda.pagoManualInstruccionesExtra?.trim();
  const base = `Coordiná el pago y enviá comprobante ${contact}. Incluí el pedido ${externalOrderId} al escribir.`;
  return extra ? `${base} ${extra}` : base;
}

export function buildManualPaymentNextSteps(
  formaPago: 'transferencia' | 'efectivo',
  tienda: TiendaConfigPublic,
  externalOrderId: string,
  defaultPhone: string,
  hasBankDetails: boolean
): string | null {
  if (formaPago === 'transferencia') {
    if (!hasBankDetails) return null;
    return buildTransferNextStepsMessage(tienda, defaultPhone);
  }
  return buildEfectivoNextStepsMessage(tienda, defaultPhone, externalOrderId);
}
