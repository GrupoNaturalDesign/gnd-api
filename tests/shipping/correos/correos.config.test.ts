import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  resolveCorreoEnv,
  mapEmpresaCorreoEnv,
  getCorreoBaseUrlForEnv,
  loadCorreoCredentials,
  isCorreoMock,
} from '../../../src/services/shipping/correo/correo.config';

describe('SH-C-01 — resolveCorreoEnv', () => {
  it('CORREO_ENV=prod → prod', () => {
    process.env.CORREO_ENV = 'prod';
    assert.strictEqual(resolveCorreoEnv(), 'prod');
  });
  it('CORREO_ENV=production → prod', () => {
    process.env.CORREO_ENV = 'production';
    assert.strictEqual(resolveCorreoEnv(), 'prod');
  });
  it('CORREO_ENV=test → test', () => {
    process.env.CORREO_ENV = 'test';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('CORREO_ENV=sandbox → test', () => {
    process.env.CORREO_ENV = 'sandbox';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('CORREO_ENV=qa → test', () => {
    process.env.CORREO_ENV = 'qa';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('CORREO_ENV=apitest → test', () => {
    process.env.CORREO_ENV = 'apitest';
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
  it('sin CORREO_ENV usa CORREO_DEFAULT_ENV=prod', () => {
    delete process.env.CORREO_ENV;
    process.env.CORREO_DEFAULT_ENV = 'prod';
    assert.strictEqual(resolveCorreoEnv(), 'prod');
  });
  it('sin vars → default test', () => {
    delete process.env.CORREO_ENV;
    delete process.env.CORREO_DEFAULT_ENV;
    assert.strictEqual(resolveCorreoEnv(), 'test');
  });
});

describe('SH-C-01 — mapEmpresaCorreoEnv', () => {
  it('prod → prod', () => {
    assert.strictEqual(mapEmpresaCorreoEnv('prod'), 'prod');
  });
  it('test → test', () => {
    assert.strictEqual(mapEmpresaCorreoEnv('test'), 'test');
  });
  it('cualquier otro valor → test', () => {
    assert.strictEqual(mapEmpresaCorreoEnv('xyz'), 'test');
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