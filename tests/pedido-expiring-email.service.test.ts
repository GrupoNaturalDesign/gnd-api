import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { getClientStoreBaseUrl } from '../src/services/pedido-expiring-email.service';

describe('pedido-expiring-email.service helpers', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(prev)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function saveEnv(key: string) {
    prev[key] = process.env[key];
  }

  it('getClientStoreBaseUrl prioriza CLIENT_URL sin barra final', () => {
    saveEnv('CLIENT_URL');
    saveEnv('FRONTEND_URL');
    process.env.CLIENT_URL = 'https://tienda.test/';
    process.env.FRONTEND_URL = 'https://ignored.test';
    assert.strictEqual(getClientStoreBaseUrl(), 'https://tienda.test');
  });

  it('getClientStoreBaseUrl cae a FRONTEND_URL', () => {
    saveEnv('CLIENT_URL');
    saveEnv('FRONTEND_URL');
    delete process.env.CLIENT_URL;
    process.env.FRONTEND_URL = 'https://front.test';
    assert.strictEqual(getClientStoreBaseUrl(), 'https://front.test');
  });
});
