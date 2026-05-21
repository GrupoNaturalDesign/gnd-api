import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { AndreaniAuthService } from '../../../src/services/shipping/andreani/andreani.auth.service';
import { ShippingHttpError } from '../../../src/services/shipping/shipping.errors';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

function makeAuth(username = 'user', password = 'pass'): AndreaniAuthService {
  return new AndreaniAuthService(
    'https://apisqa.andreani.com',
    '/login',
    { username, password },
    getMockFetch().fetch as unknown as typeof fetch
  );
}

describe('SH-A-03 — AndreaniAuthService token cache + retry', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    delete process.env.ANDREANI_MOCK;
  });
  afterEach(() => {
    delete process.env.ANDREANI_TOKEN_HEADER;
    resetGlobalFetch();
  });

  it('login devuelve token y lo cachea', async () => {
    mockFetch.setResponses([{ status: 200, json: { token: 'tok123' } }]);
    const auth = makeAuth();
    const tok = await auth.login();
    assert.strictEqual(tok, 'tok123');
    assert.strictEqual(auth.getTokenCached(), 'tok123');
  });

  it('login parsea access_token como fallback', async () => {
    mockFetch.setResponses([{ status: 200, json: { access_token: 'acc_tok' } }]);
    const auth = makeAuth();
    const tok = await auth.login();
    assert.strictEqual(tok, 'acc_tok');
  });

  it('login lanza con credenciales inválidas (401)', async () => {
    mockFetch.setResponses([{ status: 401 }]);
    const auth = makeAuth();
    await assert.rejects(auth.login(), ShippingHttpError);
  });

  it('login lanza con respuesta sin campo token', async () => {
    mockFetch.setResponses([{ status: 200, json: { data: 'no-token' } }]);
    const auth = makeAuth();
    await assert.rejects(auth.login(), /respuesta sin token/);
  });

  it('login lanza con 500', async () => {
    mockFetch.setResponses([{ status: 500, json: { error: 'Server error' } }]);
    const auth = makeAuth();
    await assert.rejects(auth.login(), ShippingHttpError);
  });

  it('login sin credenciales → ShippingValidationError', async () => {
    const auth = makeAuth('', '');
    await assert.rejects(auth.login(), /Credenciales Andreani/);
  });

  it('getToken reutiliza token cacheado sin re-login', async () => {
    mockFetch.setResponses([{ status: 200, json: { token: 'tok_cached' } }]);
    const auth = makeAuth();
    const tok1 = await auth.login();
    assert.strictEqual(tok1, 'tok_cached');
    const tok2 = await auth.getToken();
    assert.strictEqual(tok2, 'tok_cached');
    assert.strictEqual(mockFetch.getCallCount(), 1);
  });

  it('invalidate limpia token cacheado', async () => {
    mockFetch.setResponses([
      { status: 200, json: { token: 'tok1' } },
      { status: 200, json: { token: 'tok2' } },
    ]);
    const auth = makeAuth();
    await auth.login();
    assert.strictEqual(auth.getTokenCached(), 'tok1');
    auth.invalidate();
    assert.strictEqual(auth.getTokenCached(), null);
    const tok2 = await auth.getToken();
    assert.strictEqual(tok2, 'tok2');
    assert.strictEqual(mockFetch.getCallCount(), 2);
  });

  it('authHeaderForRequest usa ANDREANI_TOKEN_HEADER', async () => {
    process.env.ANDREANI_TOKEN_HEADER = 'X-Token';
    mockFetch.setResponses([{ status: 200, json: { token: 'tok' } }]);
    const auth = makeAuth();
    await auth.login();
    const h = auth.authHeaderForRequest('tok');
    assert.ok('X-Token' in h);
  });

  it('authHeaderForRequest default (sin env) usa x-authorization-token', async () => {
    delete process.env.ANDREANI_TOKEN_HEADER;
    resetGlobalFetch();
    mockFetch.setResponses([{ status: 200, json: { token: 'tok' } }]);
    const auth = makeAuth();
    await auth.login();
    const h = auth.authHeaderForRequest('tok');
    assert.ok('x-authorization-token' in h);
  });
});