import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  resolveCorreoEnv,
  mapEmpresaCorreoEnv,
  getCorreoBaseUrlForEnv,
  loadCorreoCredentials,
  isCorreoMock,
} from '../../../src/services/shipping/correo/correo.config';

describe('SH-C-01 — resolveCorreoEnv', () => {
  afterEach(() => {
    delete process.env.INTEGRATIONS_ENV;
  });

  it('INTEGRATIONS_ENV=production → prod', () => {
    process.env.INTEGRATIONS_ENV = 'production';
    assert.strictEqual(resolveCorreoEnv(), 'prod');
  });
  it('INTEGRATIONS_ENV=test → test', () => {
    process.env.INTEGRATIONS_ENV = 'test';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('INTEGRATIONS_ENV=qa → test', () => {
    process.env.INTEGRATIONS_ENV = 'qa';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('sin INTEGRATIONS_ENV → default test', () => {
    delete process.env.INTEGRATIONS_ENV;
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
});

describe('SH-C-01 — mapEmpresaCorreoEnv', () => {
  afterEach(() => {
    delete process.env.INTEGRATIONS_ENV;
  });

  it('sigue INTEGRATIONS_ENV ignorando raw BD', () => {
    process.env.INTEGRATIONS_ENV = 'production';
    assert.strictEqual(mapEmpresaCorreoEnv('test'), 'prod');
    process.env.INTEGRATIONS_ENV = 'test';
    assert.strictEqual(mapEmpresaCorreoEnv('prod'), 'test');
  });
});

describe('SH-C-01 — getCorreoBaseUrlForEnv', () => {
  it('test → apitest', () => {
    assert.ok(getCorreoBaseUrlForEnv('test').includes('apitest'));
  });
  it('prod → api correo', () => {
    assert.ok(getCorreoBaseUrlForEnv('prod').includes('api.correoargentino'));
  });
});

describe('SH-C-01 — loadCorreoCredentials', () => {
  afterEach(() => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    delete process.env.CORREO_USERNAME;
    delete process.env.CORREO_PASSWORD;
  });

  it('lanza sin credenciales', () => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_USERNAME;
    assert.throws(
      () => loadCorreoCredentials('test'),
      /Configure MiCorreo/
    );
  });

  it('carga CORREO_USERNAME_QA en test', () => {
    process.env.CORREO_USERNAME_QA = 'user_qa';
    process.env.CORREO_PASSWORD_QA = 'pass_qa';
    const creds = loadCorreoCredentials('test');
    assert.strictEqual(creds.username, 'user_qa');
    assert.strictEqual(creds.password, 'pass_qa');
  });

  it('fallback a CORREO_USERNAME genérico', () => {
    process.env.CORREO_USERNAME = 'user_gen';
    process.env.CORREO_PASSWORD = 'pass_gen';
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    const creds = loadCorreoCredentials('test');
    assert.strictEqual(creds.username, 'user_gen');
  });
});

describe('SH-C-08 — isCorreoMock', () => {
  afterEach(() => {
    delete process.env.CORREO_MOCK;
  });

  it('CORREO_MOCK=true → true', () => {
    process.env.CORREO_MOCK = 'true';
    assert.strictEqual(isCorreoMock(), true);
  });
  it('CORREO_MOCK=1 → true', () => {
    process.env.CORREO_MOCK = '1';
    assert.strictEqual(isCorreoMock(), true);
  });
  it('CORREO_MOCK=yes → true', () => {
    process.env.CORREO_MOCK = 'yes';
    assert.strictEqual(isCorreoMock(), true);
  });
  it('sin var → false', () => {
    delete process.env.CORREO_MOCK;
    assert.strictEqual(isCorreoMock(), false);
  });
  it('CORREO_MOCK=false → false', () => {
    process.env.CORREO_MOCK = 'false';
    assert.strictEqual(isCorreoMock(), false);
  });
});
