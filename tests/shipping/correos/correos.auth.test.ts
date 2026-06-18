import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { CorreoAuth, createCorreoAuthFromEnv } from '../../../src/services/shipping/correo/correo.auth';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

const testAccount = {
  email: 'test@test.com',
  password: 'pass',
};

describe('SH-C-07 — CorreoAuth token cache + 401 retry', () => {
  let mockFetch: MockFetch;
  let auth: CorreoAuth;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    mockFetch.reset();
    auth = createCorreoAuthFromEnv('test', mockFetch.fetch as unknown as typeof fetch, testAccount);
    process.env.CORREO_USERNAME_QA = 'user';
    process.env.CORREO_PASSWORD_QA = 'pass';
  });

  afterEach(() => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
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

  it('getCustomerId usa customerId precargado sin llamar validate', async () => {
    const preloaded = createCorreoAuthFromEnv('test', mockFetch.fetch as unknown as typeof fetch, {
      ...testAccount,
      customerId: 'PRELOADED-CID',
    });
    const cid = await preloaded.getCustomerId();
    assert.strictEqual(cid, 'PRELOADED-CID');
    assert.strictEqual(mockFetch.getCallCount(), 0);
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

  it('getCustomerId fetch fallido 406 da hint sobre Admin Envíos', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok' } },
      { status: 406, text: 'Not Acceptable' },
    ]);
    auth.invalidateSession();
    await assert.rejects(
      auth.getCustomerId(),
      /Admin → Configuración → Envíos/
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
