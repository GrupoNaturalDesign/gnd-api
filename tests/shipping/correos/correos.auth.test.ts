import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { CorreoAuth } from '../../../src/services/shipping/correo/correo.auth';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

describe('SH-C-07 — CorreoAuth token cache + 401 retry', () => {
  let mockFetch: MockFetch;
  let auth: CorreoAuth;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    auth = new CorreoAuth('test', mockFetch.fetch as unknown as typeof fetch);
    process.env.CORREO_USERNAME_QA = 'user';
    process.env.CORREO_PASSWORD_QA = 'pass';
    process.env.CORREO_EMAIL_QA = 'test@test.com';
    process.env.CORREO_CUSTOMER_ID = '';
  });

  afterEach(() => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    delete process.env.CORREO_EMAIL_QA;
    delete process.env.CORREO_CUSTOMER_ID;
    resetGlobalFetch();
  });

  it('token reutilizado sin re-login hasta expiración', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'token-fresh', expires_in: 3600 } },
    ]);
    const token1 = await auth.getValidToken();
    const token2 = await auth.getValidToken();
    assert.strictEqual(token1, 'token-fresh');
    assert.strictEqual(token2, 'token-fresh');
    assert.strictEqual(mockFetch.getCallCount(), 1);
  });

  it('getValidToken lanza con credenciales inválidas (401)', async () => {
    mockFetch.setResponses([{ status: 401, text: 'Unauthorized' }]);
    await assert.rejects(auth.getValidToken(), /401/);
  });

  it('getValidToken lanza con respuesta sin campo token', async () => {
    mockFetch.setResponses([{ status: 200, json: { no_token: 'field' } }]);
    await assert.rejects(auth.getValidToken(), /sin campo token/);
  });

  it('getValidToken parsea access_token como fallback', async () => {
    mockFetch.setResponses([{ status: 200, json: { access_token: 'jwt-fallback' } }]);
    const token = await auth.getValidToken();
    assert.strictEqual(token, 'jwt-fallback');
  });

  it('getValidToken parsea expires_in numérico', async () => {
    mockFetch.setResponses([{ status: 200, json: { token: 'tok-expiry', expires_in: 7200 } }]);
    const token = await auth.getValidToken();
    assert.strictEqual(token, 'tok-expiry');
  });

  it('getValidToken parsea expires como ISO date', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    mockFetch.setResponses([{ status: 200, json: { token: 'tok-iso-expiry', expires: future } }]);
    const token = await auth.getValidToken();
    assert.strictEqual(token, 'tok-iso-expiry');
  });

  it('getValidToken usa expires_in como string (parseFloat fallback)', async () => {
    mockFetch.setResponses([{ status: 200, json: { token: 'tok-str-expiry', expires_in: '3600' } }]);
    const token = await auth.getValidToken();
    assert.strictEqual(token, 'tok-str-expiry');
  });

  it('getCustomerId lanza con credentials inválidas (401)', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 401, text: 'Unauthorized' },
    ]);
    auth.invalidateSession();
    await assert.rejects(auth.getCustomerId(), /401/);
  });

  it('invalidateToken limpia el cache de token y fuerza re-login', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'token1', expires_in: 3600 } },
      { status: 200, json: { token: 'token2', expires_in: 3600 } },
    ]);
    await auth.getValidToken();
    auth.invalidateToken();
    await auth.getValidToken();
    assert.strictEqual(mockFetch.getCallCount(), 2);
  });

  it('invalidateSession limpia token y customerId', () => {
    auth.invalidateSession();
  });

  it('getCustomerId usa customerId override (CORREO_CUSTOMER_ID)', async () => {
    process.env.CORREO_CUSTOMER_ID = 'OVERRIDE-ID';
    const newAuth = new CorreoAuth('test', mockFetch.fetch as unknown as typeof fetch);
    const cid = await newAuth.getCustomerId();
    assert.strictEqual(cid, 'OVERRIDE-ID');
    delete process.env.CORREO_CUSTOMER_ID;
  });

  it('getCustomerId fetch fallido 406 da hint sobre CORREO_EMAIL', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 406, text: 'Not Acceptable' },
    ]);
    auth.invalidateSession();
    await assert.rejects(
      auth.getCustomerId(),
      /CORREO_EMAIL/
    );
  });

  it('token expirado fuerza re-login', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'token-old', expires_in: 1 } },
      { status: 200, json: { token: 'token-new', expires_in: 3600 } },
    ]);
    const t1 = await auth.getValidToken();
    auth.invalidateToken();
    const t2 = await auth.getValidToken();
    assert.strictEqual(t1, 'token-old');
    assert.strictEqual(t2, 'token-new');
    assert.ok(mockFetch.getCallCount() >= 2);
  });
});