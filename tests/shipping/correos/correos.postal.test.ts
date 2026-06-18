import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeMicorreoPostalCode } from '../../../src/services/shipping/correo/correo-postal.util';
import { buildRatesRequestBody } from '../../../src/services/shipping/correo/correo.mapper';

describe('correo-postal.util', () => {
  it('normalizeMicorreoPostalCode quita prefijo X en Córdoba', () => {
    assert.strictEqual(normalizeMicorreoPostalCode('X5016'), '5016');
    assert.strictEqual(normalizeMicorreoPostalCode('5000'), '5000');
  });

  it('buildRatesRequestBody normaliza CP destino', () => {
    const body = buildRatesRequestBody('CID', {
      postalCodeOrigin: 'X5000',
      postalCodeDestination: 'X1425',
      dimensions: { weight: 500, height: 10, width: 40, length: 50 },
    });
    assert.strictEqual(body.postalCodeOrigin, '5000');
    assert.strictEqual(body.postalCodeDestination, '1425');
  });
});
