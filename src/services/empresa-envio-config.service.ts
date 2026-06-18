import type { EmpresaEnvioConfig, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type { EnvioConfigPatchBody } from '../validation/envio-config.validation';
import { correoAccountService, type CorreoAccountStatus } from './shipping/correo/correo-account.service';
import { shippingService } from './shipping/shipping.service';

export interface EnvioConfigSenderData {
  name: string;
  email?: string;
  phone?: string;
  cellPhone?: string;
  streetName?: string;
  streetNumber?: string;
  city?: string;
  floor?: string;
  apartment?: string;
}

export interface EnvioConfigAdminView {
  id: number;
  empresaId: number;
  providerDefault: string;
  correoSenderData: EnvioConfigSenderData | null;
  correoAccountEmail: string | null;
  hasPassword: boolean;
  correoCustomerIdSuffix: string | null;
  correoAccountStatus: CorreoAccountStatus;
  correoAccountValidatedAt: Date | null;
  correoAccountLastError: string | null;
  correoOriginCp: string | null;
  correoOriginProvinceCode: string | null;
  updatedAt: Date;
}

function redactCustomerId(id: string | null | undefined): string | null {
  const v = id?.trim();
  if (!v) return null;
  if (v.length <= 4) return '****';
  return `…${v.slice(-4)}`;
}

function parseSenderData(json: Prisma.JsonValue | null): EnvioConfigSenderData | null {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return null;
  return {
    name,
    email: typeof o.email === 'string' ? o.email : undefined,
    phone: typeof o.phone === 'string' ? o.phone : undefined,
    cellPhone: typeof o.cellPhone === 'string' ? o.cellPhone : undefined,
    streetName: typeof o.streetName === 'string' ? o.streetName : undefined,
    streetNumber: typeof o.streetNumber === 'string' ? o.streetNumber : undefined,
    city: typeof o.city === 'string' ? o.city : undefined,
    floor: typeof o.floor === 'string' ? o.floor : undefined,
    apartment: typeof o.apartment === 'string' ? o.apartment : undefined,
  };
}

function mapToAdminView(row: EmpresaEnvioConfig): EnvioConfigAdminView {
  return {
    id: row.id,
    empresaId: row.empresaId,
    providerDefault: row.providerDefault,
    correoSenderData: parseSenderData(row.correoSenderData),
    correoAccountEmail: row.correoAccountEmail?.trim() || null,
    hasPassword: Boolean(row.correoAccountPasswordEnc?.trim()),
    correoCustomerIdSuffix: redactCustomerId(row.correoCustomerId),
    correoAccountStatus: (row.correoAccountStatus?.trim() ||
      'not_configured') as CorreoAccountStatus,
    correoAccountValidatedAt: row.correoAccountValidatedAt,
    correoAccountLastError: row.correoAccountLastError,
    correoOriginCp: row.correoOriginCp?.trim() || null,
    correoOriginProvinceCode: row.correoOriginProvinceCode?.trim() || null,
    updatedAt: row.updatedAt,
  };
}

function senderToJson(input: EnvioConfigPatchBody['correoSenderData']): Prisma.InputJsonValue | undefined {
  if (input == null) return undefined;
  return input as Prisma.InputJsonValue;
}

export const empresaEnvioConfigService = {
  async getEnvioConfig(empresaId: number): Promise<EnvioConfigAdminView> {
    const row = await correoAccountService.getOrCreateEnvioConfig(empresaId);
    return mapToAdminView(row);
  },

  async patchEnvioConfig(
    empresaId: number,
    input: EnvioConfigPatchBody
  ): Promise<EnvioConfigAdminView> {
    await correoAccountService.getOrCreateEnvioConfig(empresaId);
    const data: Prisma.EmpresaEnvioConfigUpdateInput = {};

    if (input.providerDefault != null) {
      data.providerDefault = input.providerDefault;
    }
    if (input.correoSenderData != null) {
      data.correoSenderData = senderToJson(input.correoSenderData);
    }
    if (input.correoAccountEmail != null) {
      data.correoAccountEmail = input.correoAccountEmail.trim() || null;
      data.correoAccountStatus = 'pending';
      data.correoCustomerId = null;
    }
    if (input.correoAccountPassword != null && input.correoAccountPassword.trim()) {
      data.correoAccountPasswordEnc = correoAccountService.encryptPasswordForStorage(
        input.correoAccountPassword.trim()
      );
      data.correoAccountStatus = 'pending';
      data.correoCustomerId = null;
    }
    if (input.correoOriginCp != null) {
      data.correoOriginCp = input.correoOriginCp.trim() || null;
    }
    if (input.correoOriginProvinceCode != null) {
      const p = input.correoOriginProvinceCode.trim().toUpperCase();
      data.correoOriginProvinceCode = p.length === 1 ? p : null;
    }

    const row = await prisma.empresaEnvioConfig.update({
      where: { empresaId },
      data,
    });
    shippingService.invalidateCorreoProviderCache(empresaId);
    return mapToAdminView(row);
  },

  async syncMicorreo(empresaId: number, passwordOverride?: string): Promise<EnvioConfigAdminView> {
    await correoAccountService.syncMicorreoAccount(empresaId, {
      passwordOverride,
    });
    shippingService.invalidateCorreoProviderCache(empresaId);
    const row = await correoAccountService.getOrCreateEnvioConfig(empresaId);
    return mapToAdminView(row);
  },

  async registerMicorreo(empresaId: number): Promise<EnvioConfigAdminView> {
    await correoAccountService.registerMicorreoAccount(empresaId);
    shippingService.invalidateCorreoProviderCache(empresaId);
    const row = await correoAccountService.getOrCreateEnvioConfig(empresaId);
    return mapToAdminView(row);
  },
};
