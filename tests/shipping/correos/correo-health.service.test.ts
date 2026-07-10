import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correoHealthService } from '../../../src/services/shipping/correo/correo-health.service';

describe('correo-health.service — modo mock', () => {
  beforeEach(() => {
    process.env.CORREO_MOCK = 'true';
  });

  afterEach(() => {
    delete process.env.CORREO_MOCK;
  });

  it('en CORREO_MOCK no marca readyForCheckout', async () => {
    const report = await correoHealthService.checkMicorreo(1);
    assert.equal(report.integrator.status, 'skipped');
    assert.equal(report.readyForCheckout, false);
  });
});
