import type { Response } from 'express';
import { mercadoPagoConfig, mercadoPagoClient } from '../services/mercadopago';
import { CorreoProvider } from '../services/shipping/correo/correo.provider';
import { AndreaniAuthService } from '../services/shipping/andreani/andreani.auth.service';
import {
  getAndreaniBaseUrl,
  getAndreaniPaths,
  isAndreaniMock,
  loadAndreaniCredentials,
  resolveAndreaniEnv,
} from '../services/shipping/andreani/andreani.config';
import {
  resolveCorreoEnv,
  isCorreoMock,
  mapEmpresaCorreoEnv,
} from '../services/shipping/correo/correo.config';
import { getIntegrationsMode, getIntegrationsModeLabel } from '../lib/integrations-mode';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import { correoAccountService } from '../services/shipping/correo/correo-account.service';

interface IntegrationStatus {
  configured: boolean;
  status: 'ok' | 'error' | 'misconfigured' | 'mock';
  mode: string | null;
  detail: string;
}

type StatusResult = {
  mercadopago: IntegrationStatus;
  correo: IntegrationStatus;
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

function checkCorreo(empresaId: number | undefined): Promise<IntegrationStatus> {
  return doCheck('MiCorreo', async () => {
    if (isCorreoMock()) {
      return mockStatus('mock', 'Modo mock activo (CORREO_MOCK=true). No se chequea conexión real.');
    }
    if (empresaId == null) {
      return misconfiguredStatus(
        'Usuario admin sin empresa asignada. Configurá MiCorreo en Admin → Envíos.'
      );
    }
    const env = resolveCorreoEnv();
    const config = await correoAccountService.getOrCreateEnvioConfig(empresaId);
    const creds = correoAccountService.resolveAccountCredentials(config);
    if (!creds) {
      return misconfiguredStatus(
        'Cuenta MiCorreo no configurada. Completá email y contraseña en Admin → Configuración → Envíos.'
      );
    }
    const provider = new CorreoProvider(
      config,
      mapEmpresaCorreoEnv(env),
      globalThis.fetch.bind(globalThis)
    );
    await provider.validateCredentials();
    const suffix = await provider.getCustomerIdSuffixForLogs();
    return okStatus(env, `Cuenta vinculada (${suffix}) y API responde correctamente`);
  });
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
