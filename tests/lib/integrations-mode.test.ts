import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assertIntegrationsConfigAtStartup,
  getIntegrationsMode,
  getIntegrationsModeLabel,
  getResolvedCredentialSuffix,
  isIntegrationsLive,
  parseIntegrationsEnv,
} from '../../src/lib/integrations-mode';

const ENV_KEYS = [
  'INTEGRATIONS_ENV',
  'MERCADOPAGO_ENV',
  'CORREO_DEFAULT_ENV',
  'ANDREANI_DEFAULT_ENV',
  'CORREO_ENV',
  'MERCADOPAGO_ACCESS_TOKEN_TEST',
  'MERCADOPAGO_ACCESS_TOKEN_PROD',
  'CORREO_USERNAME_QA',
  'CORREO_PASSWORD_QA',
  'CORREO_USERNAME_PROD',
  'CORREO_PASSWORD_PROD',
  'ANDREANI_USERNAME_QA',
  'ANDREANI_PASSWORD_QA',
  'ANDREANI_USERNAME_PROD',
  'ANDREANI_PASSWORD_PROD',
  'CORREO_MOCK',
  'ANDREANI_MOCK',
] as const;

const snapshot = new Map<string, string | undefined>();

function saveEnv(): void {
  snapshot.clear();
  for (const key of ENV_KEYS) {
    snapshot.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const val = snapshot.get(key);
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}

describe('integrations-mode — parseIntegrationsEnv', () => {
  afterEach(restoreEnv);

  it('default sin var → test', () => {
    delete process.env.INTEGRATIONS_ENV;
    assert.strictEqual(parseIntegrationsEnv(), 'test');
  });

  it('INTEGRATIONS_ENV=production → prod', () => {
    assert.strictEqual(parseIntegrationsEnv('production'), 'prod');
    process.env.INTEGRATIONS_ENV = 'production';
    assert.strictEqual(getIntegrationsMode(), 'prod');
    assert.strictEqual(isIntegrationsLive(), true);
  });

  it('aliases prod y test', () => {
    assert.strictEqual(parseIntegrationsEnv('prod'), 'prod');
    assert.strictEqual(parseIntegrationsEnv('live'), 'prod');
    assert.strictEqual(parseIntegrationsEnv('qa'), 'test');
    assert.strictEqual(parseIntegrationsEnv('sandbox'), 'test');
    assert.strictEqual(parseIntegrationsEnv('apitest'), 'test');
  });

  it('valor inválido lanza', () => {
    assert.throws(() => parseIntegrationsEnv('invalid'), /INTEGRATIONS_ENV inválido/);
  });

  it('getIntegrationsModeLabel y suffix', () => {
    process.env.INTEGRATIONS_ENV = 'test';
    assert.strictEqual(getIntegrationsModeLabel(), 'test');
    assert.strictEqual(getResolvedCredentialSuffix(), 'QA');
    process.env.INTEGRATIONS_ENV = 'production';
    assert.strictEqual(getIntegrationsModeLabel(), 'production');
    assert.strictEqual(getResolvedCredentialSuffix(), 'PROD');
  });
});

describe('integrations-mode — assertIntegrationsConfigAtStartup', () => {
  beforeEach(saveEnv);
  afterEach(restoreEnv);

  it('test sin credenciales Correo lanza', () => {
    process.env.INTEGRATIONS_ENV = 'test';
    delete process.env.CORREO_MOCK;
    delete process.env.ANDREANI_MOCK;
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST = 'tok';
    process.env.ANDREANI_USERNAME_QA = 'u';
    process.env.ANDREANI_PASSWORD_QA = 'p';
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    assert.throws(() => assertIntegrationsConfigAtStartup(), /CORREO_USERNAME_QA/);
  });

  it('prod sin CORREO_USERNAME_PROD lanza', () => {
    process.env.INTEGRATIONS_ENV = 'production';
    delete process.env.CORREO_MOCK;
    delete process.env.ANDREANI_MOCK;
    process.env.MERCADOPAGO_ACCESS_TOKEN_PROD = 'tok';
    process.env.ANDREANI_USERNAME_PROD = 'u';
    process.env.ANDREANI_PASSWORD_PROD = 'p';
    delete process.env.CORREO_USERNAME_PROD;
    assert.throws(() => assertIntegrationsConfigAtStartup(), /CORREO_USERNAME_PROD/);
  });

  it('conflicto INTEGRATIONS_ENV=test + CORREO_DEFAULT_ENV=prod lanza', () => {
    process.env.INTEGRATIONS_ENV = 'test';
    process.env.CORREO_DEFAULT_ENV = 'prod';
    assert.throws(() => assertIntegrationsConfigAtStartup({ skipCredentialCheck: true }), /CORREO_DEFAULT_ENV/);
  });

  it('mock skip credenciales shipping', () => {
    process.env.INTEGRATIONS_ENV = 'test';
    process.env.CORREO_MOCK = 'true';
    process.env.ANDREANI_MOCK = 'true';
    process.env.MERCADOPAGO_ACCESS_TOKEN_TEST = 'tok';
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.ANDREANI_USERNAME_QA;
    assert.doesNotThrow(() => assertIntegrationsConfigAtStartup());
  });
});
