import type { Empresa, EmpresaEnvioConfig } from '@prisma/client';
import { ShippingValidationError } from '../shipping.errors';
import type { CorreoSenderJson } from './correo.types';
import { parseCorreoSenderData } from './correo.mapper';
import { resolveCorreoOriginFromConfig } from './correo-postal.util';

export interface MicorreoRegisterBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  documentType: 'DNI' | 'CUIT';
  documentId: string;
  phone: string;
  cellPhone: string;
  address: {
    streetName: string;
    streetNumber: string;
    floor?: string;
    apartment?: string;
    city: string;
    provinceCode: string;
    postalCode: string;
  };
}

function normalizeCuit(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

function splitRazonSocial(razonSocial: string): { firstName: string; lastName: string } {
  const parts = razonSocial.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: 'Empresa', lastName: 'GND' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: '.' };
  }
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(' '),
  };
}

function resolveOriginCp(config: EmpresaEnvioConfig): string {
  return resolveCorreoOriginFromConfig(config).postalCode;
}

function resolveOriginProvince(config: EmpresaEnvioConfig): string {
  return resolveCorreoOriginFromConfig(config).provinceCode;
}

export function buildMicorreoRegisterBody(
  empresa: Pick<Empresa, 'razonSocial' | 'nombre' | 'cuit'>,
  config: EmpresaEnvioConfig,
  email: string,
  password: string
): MicorreoRegisterBody {
  const sender = parseCorreoSenderData(config.correoSenderData) as CorreoSenderJson & {
    cellPhone?: string;
    floor?: string;
    apartment?: string;
  };
  const cuit = normalizeCuit(empresa.cuit);
  if (!cuit || cuit.length < 10) {
    throw new ShippingValidationError(
      'La empresa debe tener CUIT válido para registrar cuenta MiCorreo'
    );
  }
  const { firstName, lastName } = splitRazonSocial(
    empresa.razonSocial?.trim() || empresa.nombre?.trim() || sender.name
  );
  const phone = sender.phone?.trim() || sender.cellPhone?.trim() || '0000000000';
  const cellPhone = sender.cellPhone?.trim() || phone;
  const postalCode = resolveOriginCp(config);
  const provinceCode = resolveOriginProvince(config);

  return {
    firstName,
    lastName,
    email: email.trim(),
    password,
    documentType: 'CUIT',
    documentId: cuit,
    phone,
    cellPhone,
    address: {
      streetName: sender.streetName?.trim() || '—',
      streetNumber: sender.streetNumber?.trim() || '0',
      floor: sender.floor?.trim() || undefined,
      apartment: sender.apartment?.trim() || undefined,
      city: sender.city?.trim() || 'Origen',
      provinceCode,
      postalCode,
    },
  };
}

export function extractCustomerIdFromMicorreoResponse(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const o = data as Record<string, unknown>;
  const cid =
    typeof o.customerId === 'string'
      ? o.customerId
      : typeof o.customer_id === 'string'
        ? o.customer_id
        : '';
  return cid.trim();
}
