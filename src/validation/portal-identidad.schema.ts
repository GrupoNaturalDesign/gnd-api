import { z } from 'zod';
import { resolverIdentidadPortal } from '../utils/portal-identidad.util';
export const documentoPortalSchema = z.string().trim().max(24).refine(
  (value) => /^[\d .-]+$/.test(value) && !!resolverIdentidadPortal(value)?.dni,
  'Ingresá un DNI o CUIL personal válido, sin letras.'
).transform((value) => resolverIdentidadPortal(value)!.dni!);
export const solicitudPortalSchema = z.object({ documento: documentoPortalSchema });
export const decisionPortalSchema = z.object({
  email: z.string().trim().email(), documento: documentoPortalSchema,
  aprobar: z.boolean(), motivo: z.string().trim().min(10).max(300), identidadComprobada: z.literal(true),
});
