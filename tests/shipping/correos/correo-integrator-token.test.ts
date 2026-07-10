import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMicorreoIntegratorToken,
  MICORREO_INTEGRATOR_UNAUTHORIZED,
} from '../../../src/services/shipping/correo/correo-integrator-token';
import { ShippingConfigError } from '../../../src/services/shipping/shipping.errors';
import { MockFetch, getMockFetch, resetGlobalFetch } from '../../helpers/mock-fetch';

describe('correo-integrator-token', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    resetGlobalFetch();
    mockFetch = getMockFetch();
    process.env.CORREO_USERNAME_QA = 'integrator-user';
    process.env.CORREO_PASSWORD_QA = 'integrator-pass';
  });

  afterEach(() => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    resetGlobalFetch();
  });

  it('devuelve token y validUntilMs cuando /token responde 200', async () => {
    mockFetch.setResponses([{ status: 200, json: { token: 'jwt-ok', expires_in: 3600 } }]);
    const result = await fetchMicorreoIntegratorToken('test', mockFetch.fetch as typeof fetch);
    assert.equal(result.token, 'jwt-ok');
    assert.ok(result.validUntilMs > Date.now());
  });

  it('401 en /token → ShippingConfigError MICORREO_INTEGRATOR_UNAUTHORIZED con http 503', async () => {
    mockFetch.setResponses([{ status: 401, text: 'Unauthorized' }]);
    await assert.rejects(
      () => fetchMicorreoIntegratorToken('test', mockFetch.fetch as typeof fetch),
      (e: unknown) => {
        assert.ok(e instanceof ShippingConfigError);
        assert.equal(e.code, MICORREO_INTEGRATOR_UNAUTHORIZED);
        assert.equal(e.httpStatus, 503);
        assert.match(e.message, /POST \/token 401/);
        return true;
      }
    );
  });

  it('sin credenciales integrador → MICORREO_INTEGRATOR_MISCONFIGURED', async () => {
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    await assert.rejects(
      () => fetchMicorreoIntegratorToken('test', mockFetch.fetch as typeof fetch),
      (e: unknown) => {
        assert.ok(e instanceof ShippingConfigError);
        assert.equal(e.code, 'MICORREO_INTEGRATOR_MISCONFIGURED');
        assert.equal(e.httpStatus, 400);
        return true;
      }
    );
  });
});
