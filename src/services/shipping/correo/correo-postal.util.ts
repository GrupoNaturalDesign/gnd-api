import type { EmpresaEnvioConfig } from '@prisma/client';
import { ShippingValidationError } from '../shipping.errors';
import type { CorreoOriginConfig } from './correo.types';

/** Normaliza CP MiCorreo: X5016 → 5016 (Córdoba). */
export function normalizeMicorreoPostalCode(cp: string): string {
  const t = cp.trim().toUpperCase();
  if (/^X\d/.test(t)) {
    return t.slice(1);
  }
  return t;
}

export function resolveCorreoOriginFromConfig(
  config: EmpresaEnvioConfig
): CorreoOriginConfig {
  const postalCode =
    config.correoOriginCp?.trim() ||
    process.env.CORREO_ORIGIN_CP?.trim() ||
    '';
  const provinceCode =
    config.correoOriginProvinceCode?.trim().toUpperCase() ||
    process.env.CORREO_ORIGIN_PROVINCE_CODE?.trim().toUpperCase() ||
    '';
  if (!postalCode) {
    throw new ShippingValidationError(
      'Configure el CP de origen en Admin → Envíos (o CORREO_ORIGIN_CP temporalmente).'
    );
  }
  if (!provinceCode || provinceCode.length !== 1 || !/[A-Z]/.test(provinceCode)) {
    throw new ShippingValidationError(
      'Configure la provincia de origen (A–Z) en Admin → Envíos.'
    );
  }
  return { postalCode, provinceCode };
}
