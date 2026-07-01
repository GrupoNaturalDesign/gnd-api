/**
 * Modo unificado de integraciones externas (MP, MiCorreo, Andreani).
 * Fuente de verdad: INTEGRATIONS_ENV (default seguro: test).
 */

export type IntegrationsMode = 'test' | 'prod';

const TEST_ALIASES = new Set([
  'test',
  'qa',
  'sandbox',
  'development',
  'dev',
  'apitest',
]);

const PROD_ALIASES = new Set(['prod', 'production', 'live']);

function trimEnv(key: string): string {
  return process.env[key]?.trim() ?? '';
}

function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return '';
}

function legacyEnvToMode(raw: string): IntegrationsMode | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (PROD_ALIASES.has(v)) return 'prod';
  if (TEST_ALIASES.has(v)) return 'test';
  return null;
}

/** Parsea INTEGRATIONS_ENV. Default seguro: test. */
export function parseIntegrationsEnv(raw?: string): IntegrationsMode {
  const v = (raw ?? trimEnv('INTEGRATIONS_ENV')).trim().toLowerCase();
  if (!v) return 'test';
  if (PROD_ALIASES.has(v)) return 'prod';
  if (TEST_ALIASES.has(v)) return 'test';
  throw new Error(
    `INTEGRATIONS_ENV inválido: "${raw ?? v}". Valores: test | production (aliases: qa, sandbox, prod, live).`
  );
}

export function getIntegrationsMode(): IntegrationsMode {
  return parseIntegrationsEnv();
}

export function isIntegrationsLive(): boolean {
  return getIntegrationsMode() === 'prod';
}

export function getIntegrationsModeLabel(): string {
  return getIntegrationsMode() === 'prod' ? 'production' : 'test';
}

export function getResolvedCredentialSuffix(): 'QA' | 'PROD' {
  return getIntegrationsMode() === 'prod' ? 'PROD' : 'QA';
}

export function getCorreoBaseUrlForMode(mode: IntegrationsMode): string {
  return mode === 'prod'
    ? 'https://api.correoargentino.com.ar/micorreo/v1'
    : 'https://apitest.correoargentino.com.ar/micorreo/v1';
}

export function getAndreaniBaseUrlForMode(mode: IntegrationsMode): string {
  const override = trimEnv('ANDREANI_BASE_URL');
  if (override) return override.replace(/\/$/, '');
  return mode === 'prod' ? 'https://apis.andreani.com' : 'https://apisqa.andreani.com';
}

function checkLegacyVarConflicts(mode: IntegrationsMode): string[] {
  const errors: string[] = [];

  const mpEnv = legacyEnvToMode(trimEnv('MERCADOPAGO_ENV'));
  if (mpEnv != null && mpEnv !== mode) {
    errors.push(
      `MERCADOPAGO_ENV=${trimEnv('MERCADOPAGO_ENV')} entra en conflicto con INTEGRATIONS_ENV=${getIntegrationsModeLabel()} (MERCADOPAGO_ENV está deprecated).`
    );
  }

  const correoDefault = legacyEnvToMode(trimEnv('CORREO_DEFAULT_ENV'));
  if (correoDefault != null && correoDefault !== mode) {
    errors.push(
      `CORREO_DEFAULT_ENV=${trimEnv('CORREO_DEFAULT_ENV')} entra en conflicto con INTEGRATIONS_ENV=${getIntegrationsModeLabel()} (CORREO_DEFAULT_ENV está deprecated).`
    );
  }

  const andreaniDefault = legacyEnvToMode(trimEnv('ANDREANI_DEFAULT_ENV'));
  if (andreaniDefault != null && andreaniDefault !== mode) {
    errors.push(
      `ANDREANI_DEFAULT_ENV=${trimEnv('ANDREANI_DEFAULT_ENV')} entra en conflicto con INTEGRATIONS_ENV=${getIntegrationsModeLabel()} (ANDREANI_DEFAULT_ENV está deprecated).`
    );
  }

  const correoEnv = legacyEnvToMode(trimEnv('CORREO_ENV'));
  if (correoEnv != null && correoEnv !== mode) {
    errors.push(
      `CORREO_ENV=${trimEnv('CORREO_ENV')} entra en conflicto con INTEGRATIONS_ENV=${getIntegrationsModeLabel()} (CORREO_ENV está deprecated).`
    );
  }

  return errors;
}

function warnLegacyVarsSet(): string[] {
  const warnings: string[] = [];
  if (trimEnv('MERCADOPAGO_ENV')) {
    warnings.push('MERCADOPAGO_ENV está deprecated; usá INTEGRATIONS_ENV.');
  }
  if (trimEnv('CORREO_DEFAULT_ENV')) {
    warnings.push('CORREO_DEFAULT_ENV está deprecated; usá INTEGRATIONS_ENV.');
  }
  if (trimEnv('ANDREANI_DEFAULT_ENV')) {
    warnings.push('ANDREANI_DEFAULT_ENV está deprecated; usá INTEGRATIONS_ENV.');
  }
  if (trimEnv('CORREO_ENV')) {
    warnings.push('CORREO_ENV está deprecated; usá INTEGRATIONS_ENV.');
  }
  return warnings;
}

function assertMercadoPagoCredentials(mode: IntegrationsMode): void {
  if (mode === 'prod') {
    const token = firstNonEmpty(
      process.env.MERCADOPAGO_ACCESS_TOKEN_PROD,
      process.env.MERCADOPAGO_ACCESS_TOKEN
    );
    if (!token) {
      throw new Error(
        'INTEGRATIONS_ENV=production requiere MERCADOPAGO_ACCESS_TOKEN_PROD o MERCADOPAGO_ACCESS_TOKEN.'
      );
    }
    const collectorId = trimEnv('MERCADOPAGO_COLLECTOR_ID');
    if (!collectorId || !/^\d+$/.test(collectorId)) {
      throw new Error(
        'INTEGRATIONS_ENV=production requiere MERCADOPAGO_COLLECTOR_ID numerico para validar el cobrador del webhook.'
      );
    }
    return;
  }
  const token = firstNonEmpty(
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST,
    process.env.MERCADOPAGO_ACCESS_TOKEN_QA,
    process.env.MERCADOPAGO_ACCESS_TOKEN
  );
  if (!token) {
    throw new Error(
      'INTEGRATIONS_ENV=test requiere MERCADOPAGO_ACCESS_TOKEN_TEST, MERCADOPAGO_ACCESS_TOKEN_QA o MERCADOPAGO_ACCESS_TOKEN.'
    );
  }
}

function assertCorreoCredentials(mode: IntegrationsMode): void {
  const isProd = mode === 'prod';
  const username = isProd
    ? firstNonEmpty(process.env.CORREO_USERNAME_PROD, process.env.CORREO_USERNAME)
    : firstNonEmpty(
        process.env.CORREO_USERNAME_QA,
        process.env.CORREO_USERNAME_TEST,
        process.env.CORREO_USERNAME
      );
  const password = isProd
    ? firstNonEmpty(process.env.CORREO_PASSWORD_PROD, process.env.CORREO_PASSWORD)
    : firstNonEmpty(
        process.env.CORREO_PASSWORD_QA,
        process.env.CORREO_PASSWORD_TEST,
        process.env.CORREO_PASSWORD
      );
  if (!username || !password) {
    const suffix = isProd ? 'PROD' : 'QA';
    throw new Error(
      `INTEGRATIONS_ENV=${getIntegrationsModeLabel()} requiere CORREO_USERNAME_${suffix}/CORREO_PASSWORD_${suffix} (o CORREO_USERNAME/CORREO_PASSWORD).`
    );
  }
}

function assertAndreaniCredentials(mode: IntegrationsMode): void {
  const isProd = mode === 'prod';
  const username = isProd
    ? firstNonEmpty(
        process.env.ANDREANI_USERNAME_PROD,
        process.env.ANDREANI_USERNAME,
        process.env.USER_ANDREANI
      )
    : firstNonEmpty(
        process.env.ANDREANI_USERNAME_QA,
        process.env.ANDREANI_USERNAME_TEST,
        process.env.ANDREANI_USERNAME,
        process.env.USER_ANDREANI
      );
  const password = isProd
    ? firstNonEmpty(
        process.env.ANDREANI_PASSWORD_PROD,
        process.env.ANDREANI_PASSWORD,
        process.env.PASS_ANDREANI
      )
    : firstNonEmpty(
        process.env.ANDREANI_PASSWORD_QA,
        process.env.ANDREANI_PASSWORD_TEST,
        process.env.ANDREANI_PASSWORD,
        process.env.PASS_ANDREANI
      );
  if (!username || !password) {
    const suffix = isProd ? 'PROD' : 'QA';
    throw new Error(
      `INTEGRATIONS_ENV=${getIntegrationsModeLabel()} requiere ANDREANI_USERNAME_${suffix}/ANDREANI_PASSWORD_${suffix} (o ANDREANI_USERNAME/ANDREANI_PASSWORD).`
    );
  }
}

/** Valida alineación y credenciales mínimas. Lanza si hay conflicto o faltan secrets. */
export function assertIntegrationsConfigAtStartup(options?: {
  skipCredentialCheck?: boolean;
}): void {
  const mode = getIntegrationsMode();
  const conflicts = checkLegacyVarConflicts(mode);
  if (conflicts.length > 0) {
    throw new Error(`Configuración de integraciones inválida:\n- ${conflicts.join('\n- ')}`);
  }

  for (const w of warnLegacyVarsSet()) {
    console.warn(`[integrations] ${w}`);
  }

  if (options?.skipCredentialCheck) return;

  const correoMock = process.env.CORREO_MOCK?.trim().toLowerCase();
  const andreaniMock = process.env.ANDREANI_MOCK?.trim().toLowerCase();
  const mockValues = new Set(['true', '1', 'yes']);

  if (!mockValues.has(correoMock ?? '')) {
    assertCorreoCredentials(mode);
  }
  if (!mockValues.has(andreaniMock ?? '')) {
    assertAndreaniCredentials(mode);
  }
  assertMercadoPagoCredentials(mode);
}

export function formatIntegrationsStartupLog(): string {
  const mode = getIntegrationsMode();
  const mpMode = isIntegrationsLive() ? 'production' : 'sandbox';
  const correoUrl = getCorreoBaseUrlForMode(mode);
  const andreaniUrl = getAndreaniBaseUrlForMode(mode);
  return `[integrations] INTEGRATIONS_ENV=${getIntegrationsModeLabel()} — MP: ${mpMode}, Correo: ${correoUrl}, Andreani: ${andreaniUrl}`;
}
