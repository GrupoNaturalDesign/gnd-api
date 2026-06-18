import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calcularPreciosDerivados,
  buildPrecioPublico,
} from '../src/services/precios-derivados.service';
import { PRECIOS_DEFAULTS } from '../src/config/precios.config';

const defaultConfig = {
  descuentoTransferencia: PRECIOS_DEFAULTS.DESCUENTO_TRANSFERENCIA,
  iva: PRECIOS_DEFAULTS.IVA,
  cuotasFinanciado: PRECIOS_DEFAULTS.CUOTAS_FINANCIADO,
};

describe('calcularPreciosDerivados', () => {
  it('calcula transfer, sinImp y cuotas desde config', () => {
    const r = calcularPreciosDerivados({
      precioLista: 100,
      empresaConfig: defaultConfig,
    });
    assert.strictEqual(r.precioTransfer, 85);
    assert.ok(Math.abs(r.precioSinImp - 70.25) < 0.01);
    assert.strictEqual(r.cuotas, defaultConfig.cuotasFinanciado);
  });

  it('respeta overrides de descuento, IVA y cuotas', () => {
    const r = calcularPreciosDerivados({
      precioLista: 200,
      empresaConfig: defaultConfig,
      descuentoOverride: 0.1,
      ivaOverride: 0.21,
      cuotasOverride: 6,
    });
    assert.strictEqual(r.precioTransfer, 180);
    assert.strictEqual(r.cuotas, 6);
  });
});

describe('buildPrecioPublico', () => {
  it('expone lista, transfer y sinImp sin montos de cuotas', () => {
    assert.deepStrictEqual(
      buildPrecioPublico({
        precioLista: 100,
        precioTransfer: 85,
        precioSinImp: 70.25,
      }),
      {
        precioLista: 100,
        precioTransfer: 85,
        precioSinImp: 70.25,
      }
    );
  });
});
