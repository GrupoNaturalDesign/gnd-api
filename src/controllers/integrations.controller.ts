import type { Response } from 'express';
import { mercadoPagoConfig, mercadoPagoClient } from '../services/mercadopago';
import { AndreaniAuthService } from '../services/shipping/andreani/andreani.auth.service';
import {
  getAndreaniBaseUrl,
  getAndreaniPaths,
  isAndreaniMock,
  loadAndreaniCredentials,
  resolveAndreaniEnv,
} from '../services/shipping/andreani/andreani.config';
import { isCorreoMock, resolveCorreoEnv } from '../services/shipping/correo/correo.config';
import {
  correoHealthService,
  type MicorreoHealthLayerStatus,
  type MicorreoHealthReport,
} from '../services/shipping/correo/correo-health.service';
import { getIntegrationsMode, getIntegrationsModeLabel } from '../lib/integrations-mode';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';

interface IntegrationStatus {
  configured: boolean;
  status: 'ok' | 'error' | 'misconfigured' | 'mock';
  mode: string | null;
  detail: string;
}

export interface MicorreoIntegrationLayer {
  status: MicorreoHealthLayerStatus;
  detail: string;
  customerIdSuffix?: string | null;
}

export interface CorreoIntegrationStatus extends IntegrationStatus {
  layers: {
    integrator: MicorreoIntegrationLayer;
    account: MicorreoIntegrationLayer;
    operational: MicorreoIntegrationLayer;
  };
  healthy: boolean;
  readyForCheckout: boolean;
}

type StatusResult = {
  mercadopago: IntegrationStatus;
  correo: CorreoIntegrationStatus;
  andreani: IntegrationStatus;
};

function okStatus(mode: string | null, detail: string): IntegrationStatus {
  return { configured: true, status: 'ok', mode, detail };
}

function mockStatus(mode: string | null, detail: string): IntegrationStatus {
  return { configured: true, status: 'mock', mode, detail };
}

function misconfiguredStatus(detail: string): IntegrationStatus {
  return { configured: false, status: 'misconfigured', mode: null, detail };
}

function errorStatus(mode: string | null, detail: string): IntegrationStatus {
  return { configured: true, status: 'error', mode, detail };
}

function mapCorreoFromHealth(report: MicorreoHealthReport): CorreoIntegrationStatus {
  const env = report.env;
  const layers = {
    integrator: {
      status: report.integrator.status,
      detail: report.integrator.detail,
    },
    account: {
      status: report.account.status,
      detail: report.account.detail,
      customerIdSuffix: report.account.customerIdSuffix,
    },
    operational: {
      status: report.operational.status,
      detail: report.operational.detail,
    },
  };
  const healthy =
    report.integrator.status === 'ok' && report.account.status === 'ok';
  const readyForCheckout = report.readyForCheckout;

  if (report.integrator.status === 'skipped') {
    const base = mockStatus('mock', report.integrator.detail);
    return { ...base, layers, healthy: false, readyForCheckout: false };
  }

  if (report.integrator.status === 'error') {
    const base = errorStatus(env, report.integrator.detail);
    return { ...base, layers, healthy: false, readyForCheckout: false };
  }

  if (report.account.status === 'misconfigured') {
    const base = misconfiguredStatus(report.account.detail);
    return { ...base, layers, healthy: false, readyForCheckout: false };
  }

  if (report.account.status === 'error') {
    const base = errorStatus(env, report.account.detail);
    return { ...base, layers, healthy: false, readyForCheckout: false };
  }

  if (report.operational.status === 'error') {
    const base = errorStatus(env, report.operational.detail);
    return { ...base, layers, healthy, readyForCheckout: false };
  }

  const suffix = report.account.customerIdSuffix;
  const detail = suffix
    ? `Integrador y cuenta portal OK (${suffix})`
    : 'Integrador y cuenta portal OK';
  const base = okStatus(env, detail);
  return { ...base, layers, healthy, readyForCheckout };
}

function checkMercadoPago(): Promise<IntegrationStatus> {
  return doCheck('Mercado Pago', async () => {
    if (!mercadoPagoConfig.isConfigured()) {
      return misconfiguredStatus(
        'Token no configurado. Revisá MERCADOPAGO_ACCESS_TOKEN_TEST o _PROD según INTEGRATIONS_ENV.'
      );
    }
    const mode = mercadoPagoConfig.getMode();
    await mercadoPagoClient.ping();
    return okStatus(mode, 'Token válido, API responde correctamente');
  });
}

async function checkCorreo(empresaId: number | undefined): Promise<CorreoIntegrationStatus> {
  if (isCorreoMock()) {
    const report = await correoHealthService.checkMicorreo(0);
    return mapCorreoFromHealth(report);
  }
  if (empresaId == null) {
    const detail =
      'Usuario admin sin empresa asignada. Configurá MiCorreo en Admin → Envíos.';
    return {
      ...misconfiguredStatus(detail),
      layers: {
        integrator: { status: 'misconfigured', detail },
        account: { status: 'misconfigured', detail, customerIdSuffix: null },
        operational: { status: 'skipped', detail: 'Sin empresa asignada' },
      },
      healthy: false,
      readyForCheckout: false,
    };
  }
  try {
    const report = await correoHealthService.checkMicorreo(empresaId);
    return mapCorreoFromHealth(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const detail = `MiCorreo: ${msg}`;
    return {
      ...errorStatus(getIntegrationsModeLabel(), detail),
      layers: {
        integrator: { status: 'error', detail },
        account: { status: 'error', detail, customerIdSuffix: null },
        operational: { status: 'skipped', detail: 'No se pudo verificar' },
      },
      healthy: false,
      readyForCheckout: false,
    };
  }
}

function checkAndreani(): Promise<IntegrationStatus> {
  return doCheck('Andreani', async () => {
    if (isAndreaniMock()) {
      return mockStatus('mock', 'Modo mock activo (ANDREANI_MOCK=true). No se chequea conexión real.');
    }
    const env = resolveAndreaniEnv();
    const baseUrl = getAndreaniBaseUrl(env);
    const paths = getAndreaniPaths();
    const creds = loadAndreaniCredentials(env);
    if (!creds.username || !creds.password) {
      return misconfiguredStatus(
        'Credenciales no configuradas. Revisá ANDREANI_USERNAME_QA/PROD y ANDREANI_PASSWORD_QA/PROD.'
      );
    }
    const auth = new AndreaniAuthService(baseUrl, paths.login, creds, globalThis.fetch.bind(globalThis));
    await auth.login();
    return okStatus(env, 'Login exitoso, credenciales válidas');
  });
}

async function doCheck(
  label: string,
  fn: () => Promise<IntegrationStatus>,
): Promise<IntegrationStatus> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorStatus(getIntegrationsModeLabel(), `${label}: ${msg}`);
  }
}

export async function getIntegrationsStatus(
  req: FirebaseAuthRequest,
  res: Response,
): Promise<void> {
  const empresaId = req.empresaId;
  const [mp, correo, andreani] = await Promise.all([
    checkMercadoPago(),
    checkCorreo(empresaId),
    checkAndreani(),
  ]);

  res.json({
    success: true,
    mode: getIntegrationsModeLabel(),
    modeRaw: getIntegrationsMode(),
    timestamp: new Date().toISOString(),
    integrations: { mercadopago: mp, correo, andreani } satisfies StatusResult,
  });
}
