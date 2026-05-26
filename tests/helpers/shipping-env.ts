import { afterEach, beforeEach, describe, it } from 'node:test';

type EnvOverride = Record<string, string | undefined>;

const snapshot: Map<string, string | undefined> = new Map();

export function withShippingEnv(
  overrides: EnvOverride,
  fn: () => void | Promise<void>
): void {
  describe('', () => {
    beforeEach(() => {
      for (const [key, val] of Object.entries(overrides)) {
        if (!snapshot.has(key)) {
          snapshot.set(key, process.env[key]);
        }
        process.env[key] = val;
      }
    });

    afterEach(() => {
      for (const key of Object.keys(overrides)) {
        process.env[key] = snapshot.get(key);
        snapshot.delete(key);
      }
    });

    it('', fn);
  });
}

export function withEnv(overrides: EnvOverride): void {
  beforeEach(() => {
    for (const [key, val] of Object.entries(overrides)) {
      process.env[key] = val;
    }
  });

  afterEach(() => {
    for (const key of Object.keys(overrides)) {
      delete process.env[key];
    }
  });
}

export const TEST_SHIPPING_ENV = {
  INTEGRATIONS_ENV: 'test',
  CORREO_MOCK: 'true',
  ANDREANI_MOCK: 'true',
  CORREO_ORIGIN_CP: '5000',
  CORREO_ORIGIN_PROVINCE_CODE: 'X',
  ANDREANI_CLIENTE: 'TEST',
  ANDREANI_CONTRATO_DOM: '1',
  ANDREANI_CONTRATO_SUC: '2',
  ANDREANI_SUCURSAL_ORIGEN: 'TEST',
  MERCADOPAGO_ACCESS_TOKEN_TEST: 'TEST-mock-token',
};

export function applyTestShippingEnv(): void {
  for (const [key, val] of Object.entries(TEST_SHIPPING_ENV)) {
    process.env[key] = val;
  }
}

export function clearShippingEnv(): void {
  const keys = [
    'INTEGRATIONS_ENV',
    'CORREO_MOCK',
    'ANDREANI_MOCK',
    'MERCADOPAGO_ACCESS_TOKEN_TEST',
    'CORREO_USERNAME_QA',
    'CORREO_PASSWORD_QA',
    'CORREO_EMAIL_QA',
    'CORREO_USERNAME_PROD',
    'CORREO_PASSWORD_PROD',
    'CORREO_ORIGIN_CP',
    'CORREO_ORIGIN_PROVINCE_CODE',
    'ANDREANI_USERNAME_QA',
    'ANDREANI_PASSWORD_QA',
    'ANDREANI_USERNAME_PROD',
    'ANDREANI_PASSWORD_PROD',
    'ANDREANI_CLIENTE',
    'ANDREANI_CONTRATO_DOM',
    'ANDREANI_CONTRATO_SUC',
    'ANDREANI_SUCURSAL_ORIGEN',
    'ANDREANI_ORIGEN_CP',
    'ANDREANI_BASE_URL',
  ];
  for (const key of keys) {
    delete process.env[key];
  }
}