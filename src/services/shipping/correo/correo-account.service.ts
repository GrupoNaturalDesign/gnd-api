import type { EmpresaEnvioConfig } from '@prisma/client';
import { shippingLogger } from '../../../lib/shipping-logger';
import { decryptSecret, encryptSecret } from '../../../lib/token-encryption';
import prisma from '../../../lib/prisma';
import type { FetchFn } from '../../../types/fetch.types';
import { AdminNotificationSeverity } from '@prisma/client';
import { adminNotificationService } from '../../admin-notification.service';
import { ShippingConfigError, ShippingValidationError } from '../shipping.errors';
import {
  CORREO_PATHS,
  getCorreoBaseUrlForEnv,
  getCorreoTimeoutMs,
  loadCorreoValidateEmail,
  loadCorreoValidatePassword,
  resolveCorreoEnv,
  type CorreoEnv,
} from './correo.config';
import { fetchMicorreoIntegratorToken } from './correo-integrator-token';
import {
  buildMicorreoRegisterBody,
  extractCustomerIdFromMicorreoResponse,
} from './correo-register.mapper';
import { resolveCorreoOriginFromConfig } from './correo-postal.util';

export type CorreoAccountStatus = 'not_configured' | 'pending' | 'active' | 'invalid';

export interface MicorreoAccountContext {
  empresaId: number;
  email: string;
  password: string;
  customerId: string | null;
  status: CorreoAccountStatus;
}

const MICORREO_NOT_CONFIGURED_MSG =
  'MiCorreo no está configurado. Completá la cuenta en Admin → Configuración → Envíos y vinculá la cuenta.';

function parseAccountStatus(raw: string | null | undefined): CorreoAccountStatus {
  const v = raw?.trim();
  if (
    v === 'not_configured' ||
    v === 'pending' ||
    v === 'active' ||
    v === 'invalid'
  ) {
    return v;
  }
  return 'not_configured';
}

function redactCustomerId(id: string): string {
  if (id.length <= 4) return '****';
  return `…${id.slice(-4)}`;
}

function resolvePasswordFromConfig(config: EmpresaEnvioConfig): string | null {
  const enc = config.correoAccountPasswordEnc?.trim();
  if (!enc) return null;
  const plain = decryptSecret(enc);
  return plain?.trim() || null;
}

/** Fallback temporal (1 release): env si BD sin email. */
function resolveAccountFromEnvFallback(env: CorreoEnv): {
  email: string;
  password: string;
} | null {
  try {
    const email = loadCorreoValidateEmail(env);
    const password = loadCorreoValidatePassword(env);
    if (!email.includes('@')) return null;
    shippingLogger.warn('[micorreo] deprecated env fallback for account email/password');
    return { email, password };
  } catch {
    return null;
  }
}

async function micorreoPostJson(
  env: CorreoEnv,
  fetchImpl: FetchFn,
  path: string,
  body: unknown,
  token: string
): Promise<{ status: number; text: string; data: unknown }> {
  const url = `${getCorreoBaseUrlForEnv(env)}${path}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), getCorreoTimeoutMs());
  t.unref?.();
  shippingLogger.info('MiCorreo request start', { method: 'POST', path });
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: c.signal,
  });
  const text = await res.text();
  shippingLogger.info('MiCorreo request end', {
    method: 'POST',
    path,
    status: res.status,
  });
  let data: unknown = {};
  try {
    data = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, text, data };
}

async function persistAccountSuccess(
  empresaId: number,
  customerId: string
): Promise<void> {
  await prisma.empresaEnvioConfig.update({
    where: { empresaId },
    data: {
      correoCustomerId: customerId,
      correoAccountStatus: 'active',
      correoAccountValidatedAt: new Date(),
      correoAccountLastError: null,
    },
  });
  shippingLogger.info('MiCorreo customerId persistido', {
    empresaId,
    customerIdSuffix: redactCustomerId(customerId),
  });
}

async function persistAccountFailure(
  empresaId: number,
  message: string
): Promise<void> {
  await prisma.empresaEnvioConfig.update({
    where: { empresaId },
    data: {
      correoAccountStatus: 'invalid',
      correoAccountLastError: message.slice(0, 2000),
    },
  });
}

async function notifySyncFailed(empresaId: number, message: string): Promise<void> {
  await adminNotificationService.createAndEmit({
    empresaId,
    type: 'micorreo.sync_failed',
    severity: AdminNotificationSeverity.error,
    title: 'MiCorreo: falló la vinculación de cuenta',
    message: message.slice(0, 500),
    entityType: 'empresa_envio_config',
    entityId: empresaId,
  });
}

export class CorreoAccountService {
  constructor(private readonly fetchImpl: FetchFn = globalThis.fetch.bind(globalThis)) {}

  async getOrCreateEnvioConfig(empresaId: number): Promise<EmpresaEnvioConfig> {
    const existing = await prisma.empresaEnvioConfig.findUnique({ where: { empresaId } });
    if (existing) return existing;
    const defProvider = process.env.SHIPPING_DEFAULT_PROVIDER?.trim() || 'correo';
    const integrationsEnv = resolveCorreoEnv();
    return prisma.empresaEnvioConfig.create({
      data: {
        empresaId,
        providerDefault: defProvider === 'andreani' ? 'andreani' : 'correo',
        correoEnv: integrationsEnv,
        andreaniEnv: integrationsEnv,
        correoAccountStatus: 'not_configured',
      },
    });
  }

  resolveAccountCredentials(config: EmpresaEnvioConfig): {
    email: string;
    password: string;
  } | null {
    const email = config.correoAccountEmail?.trim();
    const password = resolvePasswordFromConfig(config);
    if (email && password) return { email, password };
    const env = resolveCorreoEnv();
    return resolveAccountFromEnvFallback(env);
  }

  async getAccountContext(empresaId: number): Promise<MicorreoAccountContext> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    const creds = this.resolveAccountCredentials(config);
    return {
      empresaId,
      email: creds?.email ?? '',
      password: creds?.password ?? '',
      customerId: config.correoCustomerId?.trim() || null,
      status: parseAccountStatus(config.correoAccountStatus),
    };
  }

  async syncMicorreoAccount(
    empresaId: number,
    options?: { passwordOverride?: string }
  ): Promise<string> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    let email = config.correoAccountEmail?.trim();
    let password = options?.passwordOverride?.trim() || resolvePasswordFromConfig(config);

    if (!email || !password) {
      const fallback = resolveAccountFromEnvFallback(resolveCorreoEnv());
      if (!email && fallback?.email) email = fallback.email;
      if (!password && fallback?.password) password = fallback.password;
    }

    if (!email || !password) {
      if (email && !password) {
        throw new ShippingValidationError(
          'Ingresá la contraseña de la cuenta MiCorreo para vincular.'
        );
      }
      throw new ShippingValidationError(MICORREO_NOT_CONFIGURED_MSG);
    }

    const env = resolveCorreoEnv();
    await prisma.empresaEnvioConfig.update({
      where: { empresaId },
      data: { correoAccountStatus: 'pending', correoAccountLastError: null },
    });

    try {
      const { token } = await fetchMicorreoIntegratorToken(env, this.fetchImpl);
      const { status, text, data } = await micorreoPostJson(
        env,
        this.fetchImpl,
        CORREO_PATHS.usersValidate,
        { email, password },
        token
      );
      if (!status || status >= 400) {
        const msg =
          status === 406
            ? 'Credenciales MiCorreo inválidas. Revisá email y contraseña en Admin → Envíos.'
            : `MiCorreo validate ${status}: ${text.slice(0, 300)}`;
        await persistAccountFailure(empresaId, msg);
        await notifySyncFailed(empresaId, msg);
        throw new ShippingValidationError(msg);
      }
      const customerId = extractCustomerIdFromMicorreoResponse(data);
      if (!customerId) {
        const msg = 'MiCorreo no devolvió customerId tras validate';
        await persistAccountFailure(empresaId, msg);
        throw new ShippingValidationError(msg);
      }
      await persistAccountSuccess(empresaId, customerId);
      return customerId;
    } catch (e: unknown) {
      if (e instanceof ShippingValidationError || e instanceof ShippingConfigError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      await persistAccountFailure(empresaId, msg);
      await notifySyncFailed(empresaId, msg);
      throw new ShippingValidationError(`No se pudo vincular MiCorreo: ${msg}`);
    }
  }

  async ensureMicorreoCustomerId(empresaId: number): Promise<string> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    const status = parseAccountStatus(config.correoAccountStatus);
    const cached = config.correoCustomerId?.trim();
    if (status === 'active' && cached) return cached;
    return this.syncMicorreoAccount(empresaId);
  }

  async registerMicorreoAccount(empresaId: number): Promise<string> {
    const config = await this.getOrCreateEnvioConfig(empresaId);
    const email = config.correoAccountEmail?.trim();
    const password = resolvePasswordFromConfig(config);
    if (!email || !password) {
      throw new ShippingValidationError(
        'Completá email y contraseña MiCorreo antes de crear la cuenta.'
      );
    }
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!empresa) {
      throw new ShippingValidationError('Empresa no encontrada');
    }

    const env = resolveCorreoEnv();
    const body = buildMicorreoRegisterBody(empresa, config, email, password);
    await prisma.empresaEnvioConfig.update({
      where: { empresaId },
      data: { correoAccountStatus: 'pending', correoAccountLastError: null },
    });

    try {
      const { token } = await fetchMicorreoIntegratorToken(env, this.fetchImpl);
      const { status, text, data } = await micorreoPostJson(
        env,
        this.fetchImpl,
        CORREO_PATHS.usersRegister,
        body,
        token
      );
      if (status === 409 || status === 406 || status === 400) {
        shippingLogger.info('MiCorreo register rechazado, intentando validate', {
          empresaId,
          status,
        });
        return this.syncMicorreoAccount(empresaId);
      }
      if (!status || status >= 400) {
        const msg = `MiCorreo register ${status}: ${text.slice(0, 300)}`;
        await persistAccountFailure(empresaId, msg);
        throw new ShippingValidationError(msg);
      }
      const customerId = extractCustomerIdFromMicorreoResponse(data);
      if (!customerId) {
        return this.syncMicorreoAccount(empresaId);
      }
      await persistAccountSuccess(empresaId, customerId);
      return customerId;
    } catch (e: unknown) {
      if (e instanceof ShippingValidationError || e instanceof ShippingConfigError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      await persistAccountFailure(empresaId, msg);
      throw new ShippingValidationError(`No se pudo registrar MiCorreo: ${msg}`);
    }
  }

  encryptPasswordForStorage(plain: string): string {
    return encryptSecret(plain);
  }

  /** Persiste customerId tras validate en runtime (checkout/import). */
  async persistValidatedCustomerId(empresaId: number, customerId: string): Promise<void> {
    await persistAccountSuccess(empresaId, customerId);
  }

  invalidateProviderCache?: () => void;
}

export { MICORREO_NOT_CONFIGURED_MSG };

export const correoAccountService = new CorreoAccountService();
