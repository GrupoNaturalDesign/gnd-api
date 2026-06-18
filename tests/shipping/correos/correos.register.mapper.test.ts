import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildMicorreoRegisterBody } from '../../../src/services/shipping/correo/correo-register.mapper';
import type { EmpresaEnvioConfig } from '@prisma/client';

function baseConfig(): EmpresaEnvioConfig {
  return {
    id: 1,
    empresaId: 1,
    providerDefault: 'correo',
    correoApiKey: null,
    correoAgreement: null,
    correoServiceType: null,
    correoSenderData: {
      name: 'GND',
      streetName: 'San Martín',
      streetNumber: '100',
      city: 'Córdoba',
      phone: '3510000000',
    },
    correoAccountEmail: 'empresa@test.com',
    correoAccountPasswordEnc: null,
    correoCustomerId: null,
    correoAccountStatus: 'pending',
    correoAccountValidatedAt: null,
    correoAccountLastError: null,
    correoOriginCp: '5000',
    correoOriginProvinceCode: 'X',
    correoEnv: 'test',
    andreaniEnv: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('correo-register.mapper', () => {
  it('buildMicorreoRegisterBody usa CUIT de empresa', () => {
    const body = buildMicorreoRegisterBody(
      { razonSocial: 'Natural Design SA', nombre: 'GND', cuit: '30-12345678-9' },
      baseConfig(),
      'empresa@test.com',
      'secret123'
    );
    assert.strictEqual(body.documentType, 'CUIT');
    assert.strictEqual(body.documentId, '30123456789');
    assert.strictEqual(body.email, 'empresa@test.com');
    assert.strictEqual(body.address.provinceCode, 'X');
    assert.strictEqual(body.address.postalCode, '5000');
  });
});
