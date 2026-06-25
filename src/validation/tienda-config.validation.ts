import { z } from 'zod';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v.trim()));

const optionalText = z
  .string()
  .max(2000)
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v.trim()));

export const tiendaConfigBodySchema = z
  .object({
    emailPedidosInterno: optionalTrimmed(255),
    whatsappTelefono: optionalTrimmed(50),
    whatsappMensajeDefault: optionalText,
    retiroDireccion: optionalText,
    retiroHorarios: optionalText,
    retiroDemora: optionalTrimmed(255),
    retiroNotas: optionalText,
    pagoManualInstruccionesExtra: optionalText,
  })
  .transform((data) => ({
    emailPedidosInterno: data.emailPedidosInterno || null,
    whatsappTelefono: data.whatsappTelefono || null,
    whatsappMensajeDefault: data.whatsappMensajeDefault || null,
    retiroDireccion: data.retiroDireccion || null,
    retiroHorarios: data.retiroHorarios || null,
    retiroDemora: data.retiroDemora || null,
    retiroNotas: data.retiroNotas || null,
    pagoManualInstruccionesExtra: data.pagoManualInstruccionesExtra || null,
  }));

export type TiendaConfigBody = z.infer<typeof tiendaConfigBodySchema>;
