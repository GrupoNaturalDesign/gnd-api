import prisma from '../lib/prisma';
import type { TiendaConfigBody } from '../validation/tienda-config.validation';
import { getCheckoutManualExpiresHours } from './pedido-checkout.service';

export interface TiendaConfigRecord {
  id: number;
  empresaId: number;
  emailPedidosInterno: string | null;
  whatsappTelefono: string | null;
  whatsappMensajeDefault: string | null;
  retiroDireccion: string | null;
  retiroHorarios: string | null;
  retiroDemora: string | null;
  retiroNotas: string | null;
  pagoManualInstruccionesExtra: string | null;
  updatedAt: Date;
}

export interface TiendaConfigPublic {
  emailPedidosInterno: string | null;
  whatsappTelefono: string;
  whatsappMensajeDefault: string;
  retiroDireccion: string;
  retiroHorarios: string | null;
  retiroDemora: string | null;
  retiroNotas: string | null;
  pagoManualInstruccionesExtra: string | null;
  pagoManualHorasPlazo: number;
}

const DEFAULT_WHATSAPP_PHONE = '+54 9 3517 13-6311';
const DEFAULT_WHATSAPP_MESSAGE =
  '¡Hola! Me gustaría recibir atención personalizada.';
const DEFAULT_RETIRO_DIRECCION = 'Alta Córdoba, Córdoba Capital.';
const DEFAULT_RETIRO_DEMORA = 'Demora de 48 a 72 hs para poder retirar';
const DEFAULT_RETIRO_NOTAS = 'Esperá confirmación por mail';

function mapRow(row: {
  id: number;
  empresaId: number;
  emailPedidosInterno: string | null;
  whatsappTelefono: string | null;
  whatsappMensajeDefault: string | null;
  retiroDireccion: string | null;
  retiroHorarios: string | null;
  retiroDemora: string | null;
  retiroNotas: string | null;
  pagoManualInstruccionesExtra: string | null;
  updatedAt: Date;
}): TiendaConfigRecord {
  return {
    id: row.id,
    empresaId: row.empresaId,
    emailPedidosInterno: row.emailPedidosInterno,
    whatsappTelefono: row.whatsappTelefono,
    whatsappMensajeDefault: row.whatsappMensajeDefault,
    retiroDireccion: row.retiroDireccion,
    retiroHorarios: row.retiroHorarios,
    retiroDemora: row.retiroDemora,
    retiroNotas: row.retiroNotas,
    pagoManualInstruccionesExtra: row.pagoManualInstruccionesExtra,
    updatedAt: row.updatedAt,
  };
}

export function getDefaultWhatsappPhone(): string {
  return process.env.BRAND_WHATSAPP_PHONE?.trim() || DEFAULT_WHATSAPP_PHONE;
}

export function getDefaultWhatsappMessage(): string {
  return DEFAULT_WHATSAPP_MESSAGE;
}

export function getDefaultRetiroDireccion(): string {
  return process.env.STORE_PICKUP_ADDRESS?.trim() || DEFAULT_RETIRO_DIRECCION;
}

/** Admin → `RESEND_INTERNAL_TO`. Única resolución para pedidos, contacto y copy de comprobante. */
export function resolveEmailPedidosInternoSync(dbValue?: string | null): string | null {
  const fromDb = dbValue?.trim();
  if (fromDb) return fromDb;
  const fromEnv = process.env.RESEND_INTERNAL_TO?.trim();
  return fromEnv || null;
}

function buildPublicFromRecord(row: TiendaConfigRecord | null): TiendaConfigPublic {
  return {
    emailPedidosInterno: resolveEmailPedidosInternoSync(row?.emailPedidosInterno),
    whatsappTelefono: row?.whatsappTelefono?.trim() || getDefaultWhatsappPhone(),
    whatsappMensajeDefault:
      row?.whatsappMensajeDefault?.trim() || getDefaultWhatsappMessage(),
    retiroDireccion: row?.retiroDireccion?.trim() || getDefaultRetiroDireccion(),
    retiroHorarios: row?.retiroHorarios?.trim() || null,
    retiroDemora: row?.retiroDemora?.trim() || DEFAULT_RETIRO_DEMORA,
    retiroNotas: row?.retiroNotas?.trim() || DEFAULT_RETIRO_NOTAS,
    pagoManualInstruccionesExtra: row?.pagoManualInstruccionesExtra?.trim() || null,
    pagoManualHorasPlazo: getCheckoutManualExpiresHours(),
  };
}

export const empresaTiendaConfigService = {
  async getTiendaConfig(empresaId: number): Promise<TiendaConfigRecord | null> {
    const row = await prisma.empresaTiendaConfig.findUnique({
      where: { empresaId },
    });
    return row ? mapRow(row) : null;
  },

  async getTiendaConfigPublic(empresaId: number): Promise<TiendaConfigPublic> {
    const row = await this.getTiendaConfig(empresaId);
    return buildPublicFromRecord(row);
  },

  async resolveEmailPedidosInterno(empresaId: number): Promise<string | null> {
    const row = await this.getTiendaConfig(empresaId);
    return resolveEmailPedidosInternoSync(row?.emailPedidosInterno);
  },

  async resolveRetiroDireccion(empresaId: number): Promise<string> {
    const pub = await this.getTiendaConfigPublic(empresaId);
    return pub.retiroDireccion;
  },

  async upsertTiendaConfig(
    empresaId: number,
    input: TiendaConfigBody
  ): Promise<TiendaConfigRecord> {
    const row = await prisma.empresaTiendaConfig.upsert({
      where: { empresaId },
      create: { empresaId, ...input },
      update: { ...input },
    });
    return mapRow(row);
  },
};
