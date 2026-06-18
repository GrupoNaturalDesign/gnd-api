import { z } from 'zod';

const provinceCodeSchema = z
  .string()
  .trim()
  .length(1)
  .regex(/^[A-Za-z]$/, 'Provincia: una letra A–Z')
  .transform((s) => s.toUpperCase());

export const correoSenderDataSchema = z.object({
  name: z.string().trim().min(1, 'Nombre remitente obligatorio').max(255),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  cellPhone: z.string().trim().max(30).optional(),
  streetName: z.string().trim().max(255).optional(),
  streetNumber: z.string().trim().max(20).optional(),
  city: z.string().trim().max(100).optional(),
  floor: z.string().trim().max(10).optional(),
  apartment: z.string().trim().max(10).optional(),
});

export const envioConfigPatchSchema = z.object({
  providerDefault: z.enum(['correo', 'andreani']).optional(),
  correoSenderData: correoSenderDataSchema.optional(),
  correoAccountEmail: z.string().trim().email().optional(),
  correoAccountPassword: z.string().min(1).max(200).optional(),
  correoOriginCp: z.string().trim().min(4).max(10).optional(),
  correoOriginProvinceCode: provinceCodeSchema.optional(),
});

export const envioConfigSyncSchema = z.object({
  correoAccountPassword: z.string().min(1).max(200).optional(),
});

export type EnvioConfigPatchBody = z.infer<typeof envioConfigPatchSchema>;
export type EnvioConfigSyncBody = z.infer<typeof envioConfigSyncSchema>;
