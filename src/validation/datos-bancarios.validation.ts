import { z } from 'zod';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v.trim()));

export const datosBancariosBodySchema = z
  .object({
    banco: z.string().trim().min(1).max(100),
    tipoCuenta: z.string().trim().min(1).max(50),
    numeroCuenta: z.string().trim().min(1).max(50),
    cbu: optionalTrimmed(22),
    alias: optionalTrimmed(50),
    titular: z.string().trim().min(1).max(255),
    cuit: optionalTrimmed(50),
    instrucciones: z.string().trim().max(500).optional(),
    activo: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const cbu = data.cbu?.replace(/\s/g, '') ?? '';
    const alias = data.alias?.trim() ?? '';
    if (cbu && !/^\d{22}$/.test(cbu)) {
      ctx.addIssue({ code: 'custom', message: 'CBU debe tener 22 dígitos.', path: ['cbu'] });
    }
    if (!cbu && !alias) {
      ctx.addIssue({
        code: 'custom',
        message: 'Indicá CBU o alias para transferencias.',
        path: ['cbu'],
      });
    }
  })
  .transform((data) => ({
    ...data,
    cbu: data.cbu?.replace(/\s/g, '') || null,
    alias: data.alias || null,
    cuit: data.cuit || null,
    instrucciones: data.instrucciones?.trim() || null,
    activo: data.activo ?? true,
  }));

export type DatosBancariosBody = z.infer<typeof datosBancariosBodySchema>;
