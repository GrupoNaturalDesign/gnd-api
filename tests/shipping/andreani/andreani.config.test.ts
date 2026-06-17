import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  mapEmpresaEnvioToAndreaniEnv,
  getAndreaniBaseUrl,
  isAndreaniMock,
  getAndreaniClienteCode,
  getAndreaniContratoDomicilio,
  getAndreaniContratoSucursal,
} from '../../../src/services/shipping/andreani/andreani.config';

describe('SH-A-01 - QA vs prod URLs', () => {
  it('test -> apisqa.andreani.com', () => {
    assert.ok(getAndreaniBaseUrl('test').includes('apisqa'));
  });
  it('prod -> apis.andreani.com', () => {
    assert.ok(getAndreaniBaseUrl('prod').includes('apis.andreani'));
  });
  it('ANDREANI_BASE_URL override tiene prioridad', () => {
    process.env.ANDREANI_BASE_URL = 'https://custom.andreani.test/v1';
    assert.strictEqual(getAndreaniBaseUrl('test'), 'https://custom.andreani.test/v1');
    delete process.env.ANDREANI_BASE_URL;
  });
  it('ANDREANI_BASE_URL sin trailing slash', () => {
    process.env.ANDREANI_BASE_URL = 'https://custom.andreani.test/v1/';
    assert.strictEqual(getAndreaniBaseUrl('test'), 'https://custom.andreani.test/v1');
    delete process.env.ANDREANI_BASE_URL;
  });
});

describe('SH-A-01 - isAndreaniMock', () => {
  afterEach(() => { delete process.env.ANDREANI_MOCK; });

  it('ANDREANI_MOCK=true -> true', () => {
    process.env.ANDREANI_MOCK = 'true';
    assert.strictEqual(isAndreaniMock(), true);
  });
  it('ANDREANI_MOCK=1 -> true', () => {
    process.env.ANDREANI_MOCK = '1';
    assert.strictEqual(isAndreaniMock(), true);
  });
  it('ANDREANI_MOCK=yes -> true', () => {
    process.env.ANDREANI_MOCK = 'yes';
    assert.strictEqual(isAndreaniMock(), true);
  });
  it('sin var -> false', () => {
    delete process.env.ANDREANI_MOCK;
    assert.strictEqual(isAndreaniMock(), false);
  });
  it('ANDREANI_MOCK=false -> false', () => {
    process.env.ANDREANI_MOCK = 'false';
    assert.strictEqual(isAndreaniMock(), false);
  });
});

describe('SH-A-01 - getAndreaniClienteCode', () => {
  afterEach(() => { delete process.env.ANDREANI_CLIENTE; });

  it('devuelve valor de env', () => {
    process.env.ANDREANI_CLIENTE = 'CLIENTE123';
    assert.strictEqual(getAndreaniClienteCode(), 'CLIENTE123');
  });
  it('devuelve vacio si no existe', () => {
    delete process.env.ANDREANI_CLIENTE;
    assert.strictEqual(getAndreaniClienteCode(), '');
  });
});

describe('SH-A-01 - getAndreaniContratoDomicilio', () => {
  afterEach(() => {
    delete process.env.ANDREANI_CONTRATO_ENTREGA_DOMICILIO;
    delete process.env.ANDREANI_CONTRATO_DOM;
  });

  it('devuelve valor legacy de env', () => {
    process.env.ANDREANI_CONTRATO_DOM = 'CONTRATO-DOM';
    assert.strictEqual(getAndreaniContratoDomicilio(), 'CONTRATO-DOM');
  });
  it('prioriza ANDREANI_CONTRATO_ENTREGA_DOMICILIO', () => {
    process.env.ANDREANI_CONTRATO_ENTREGA_DOMICILIO = 'CONTRATO-ENTREGA-DOM';
    process.env.ANDREANI_CONTRATO_DOM = 'CONTRATO-DOM';
    assert.strictEqual(getAndreaniContratoDomicilio(), 'CONTRATO-ENTREGA-DOM');
  });
  it('devuelve vacio si no existe', () => {
    delete process.env.ANDREANI_CONTRATO_ENTREGA_DOMICILIO;
    delete process.env.ANDREANI_CONTRATO_DOM;
    assert.strictEqual(getAndreaniContratoDomicilio(), '');
  });
});

describe('SH-A-01 - getAndreaniContratoSucursal', () => {
  afterEach(() => {
    delete process.env.ANDREANI_CONTRATO_ENTREGA_SUCURSAL;
    delete process.env.ANDREANI_CONTRATO_SUC;
  });

  it('devuelve valor legacy de env', () => {
    process.env.ANDREANI_CONTRATO_SUC = 'CONTRATO-SUC';
    assert.strictEqual(getAndreaniContratoSucursal(), 'CONTRATO-SUC');
  });
  it('prioriza ANDREANI_CONTRATO_ENTREGA_SUCURSAL', () => {
    process.env.ANDREANI_CONTRATO_ENTREGA_SUCURSAL = 'CONTRATO-ENTREGA-SUC';
    process.env.ANDREANI_CONTRATO_SUC = 'CONTRATO-SUC';
    assert.strictEqual(getAndreaniContratoSucursal(), 'CONTRATO-ENTREGA-SUC');
  });
  it('devuelve vacio si no existe', () => {
    delete process.env.ANDREANI_CONTRATO_ENTREGA_SUCURSAL;
    delete process.env.ANDREANI_CONTRATO_SUC;
    assert.strictEqual(getAndreaniContratoSucursal(), '');
  });
});

describe('SH-A-01 - mapEmpresaEnvioToAndreaniEnv', () => {
  afterEach(() => {
    delete process.env.INTEGRATIONS_ENV;
  });

  it('sigue INTEGRATIONS_ENV ignorando raw BD', () => {
    process.env.INTEGRATIONS_ENV = 'production';
    assert.strictEqual(mapEmpresaEnvioToAndreaniEnv('test'), 'prod');
    process.env.INTEGRATIONS_ENV = 'test';
    assert.strictEqual(mapEmpresaEnvioToAndreaniEnv('prod'), 'test');
  });
});
