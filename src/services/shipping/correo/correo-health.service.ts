import type { EmpresaEnvioConfig } from '@prisma/client';
import { isCorreoMock, resolveCorreoEnv, type CorreoEnv } from './correo.config';
import { correoAccountService, type CorreoAccountStatus } from './correo-account.service';
import { fetchMicorreoIntegratorToken } from './correo-integrator-token';
import { CorreoProvider } from './correo.provider';
import { mapEmpresaCorreoEnv } from './correo.config';
import { ShippingConfigError } from '../shipping.errors';
import type { FetchFn } from '../../../types/fetch.types';

export type MicorreoHealthLayerStatus = 'ok' | 'error' | 'misconfigured' | 'skipped';

export interface MicorreoHealthLayer {
  status: MicorreoHealthLayerStatus;
  detail: string;
}

export interface MicorreoHealthReport {
  env: CorreoEnv;
  integrator: MicorreoHealthLayer;
  account: MicorreoHealthLayer & { customerIdSuffix: string | null };
  operational: MicorreoHealthLayer;
  readyForCheckout: boolean;
}

function redactCustomerId(id: string | null | undefined): string | null {
  const v = id?.trim();
  if (!v) return null;
  if (v.length <= 4) return '****';
  return `…${v.slice(-4)}`;
}

function accountStatusLabel(status: CorreoAccountStatus): string {
  switch (status) {
    case 'active':
      return 'vinculada';
    case 'pending':
      return 'pendiente';
    case 'invalid':
      return 'error';
    default:
      return 'sin configurar';
  }
}

export class CorreoHealthService {
  constructor(private readonly fetchImpl: FetchFn = globalThis.fetch.bind(globalThis)) {}

  async checkMicorreo(empresaId: number): Promise<MicorreoHealthReport> {
    const env = resolveCorreoEnv();

    if (isCorreoMock()) {
      return {
        env,
        integrator: { status: 'skipped', detail: 'CORREO_MOCK=true: no se verifica API real' },
        account: {
          status: 'skipped',
          detail: 'Modo mock',
          customerIdSuffix: null,
        },
        operational: { status: 'skipped', detail: 'Modo mock' },
        readyForCheckout: false,
      };
    }

    const config = await correoAccountService.getOrCreateEnvioConfig(empresaId);
    const customerIdSuffix = redactCustomerId(config.correoCustomerId);
    const accountStatus = (config.correoAccountStatus?.trim() ||
      'not_configured') as CorreoAccountStatus;

    const integrator = await this.checkIntegrator(env);
    const account = this.checkAccountFromConfig(config, accountStatus, customerIdSuffix);
    const operational = await this.checkOperational(
      config,
      env,
      integrator.status,
      account.status
    );

    const readyForCheckout =
      integrator.status === 'ok' &&
      account.status === 'ok' &&
      operational.status === 'ok';

    return {
      env,
      integrator,
      account: { ...account, customerIdSuffix },
      operational,
      readyForCheckout,
    };
  }

  private async checkIntegrator(env: CorreoEnv): Promise<MicorreoHealthLayer> {
    try {
      await fetchMicorreoIntegratorToken(env, this.fetchImpl);
      const envLabel = env === 'prod' ? 'producción' : 'test/sandbox';
      return {
        status: 'ok',
        detail: `API integrador OK (POST /token, ${envLabel})`,
      };
    } catch (e: unknown) {
      if (e instanceof ShippingConfigError) {
        return { status: 'error', detail: e.message };
      }
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 'error', detail: msg };
    }
  }

  private checkAccountFromConfig(
    config: EmpresaEnvioConfig,
    accountStatus: CorreoAccountStatus,
    customerIdSuffix: string | null
  ): Omit<MicorreoHealthLayer, never> & { customerIdSuffix: string | null } {
    const creds = correoAccountService.resolveAccountCredentials(config);
    const email = config.correoAccountEmail?.trim();

    if (!email || !creds?.password) {
      return {
        status: 'misconfigured',
        detail: 'Completá email y contraseña de la cuenta portal en Admin → Envíos',
        customerIdSuffix,
      };
    }

    if (accountStatus === 'active' && customerIdSuffix) {
      return {
        status: 'ok',
        detail: `Cuenta portal ${accountStatusLabel(accountStatus)} (${customerIdSuffix})`,
        customerIdSuffix,
      };
    }

    if (accountStatus === 'invalid' && config.correoAccountLastError?.trim()) {
      return {
        status: 'error',
        detail: config.correoAccountLastError.trim(),
        customerIdSuffix,
      };
    }

    return {
      status: accountStatus === 'pending' ? 'misconfigured' : 'misconfigured',
      detail: `Cuenta portal ${accountStatusLabel(accountStatus)}. Vinculá la cuenta en Admin → Envíos.`,
      customerIdSuffix,
    };
  }

  private async checkOperational(
    config: EmpresaEnvioConfig,
    env: CorreoEnv,
    integratorStatus: MicorreoHealthLayerStatus,
    accountStatus: MicorreoHealthLayerStatus
  ): Promise<MicorreoHealthLayer> {
    if (integratorStatus !== 'ok') {
      return {
        status: 'skipped',
        detail: 'No se probó cotización: integrador API no disponible',
      };
    }
    if (accountStatus !== 'ok') {
      return {
        status: 'skipped',
        detail: 'No se probó cotización: cuenta portal no vinculada',
      };
    }

    try {
      const provider = new CorreoProvider(
        config,
        mapEmpresaCorreoEnv(env),
        this.fetchImpl
      );
      await provider.validateCredentials();
      return {
        status: 'ok',
        detail: 'Validate de cuenta portal OK',
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        status: 'error',
        detail: `Validate cuenta portal falló: ${msg}`,
      };
    }
  }
}

export const correoHealthService = new CorreoHealthService();
