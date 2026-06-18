import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildParcelFromShippingLines } from '../../src/utils/shipping-parcel.util';

describe('buildParcelFromShippingLines', () => {
  it('calcula bulto desde una prenda (Bomber 612g, 50x80, alto 8)', () => {
    process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
    const parcel = buildParcelFromShippingLines(
      [
        {
          codigo: 'L-OF-CA-BMBES7',
          cantidad: 1,
          pesoGrams: 612,
          anchoCm: 50,
          largoCm: 80,
          subrubro: 'CAMPERA',
        },
      ],
      15000
    );
    assert.strictEqual(parcel.weightGrams, 612);
    assert.strictEqual(parcel.width, 50);
    assert.strictEqual(parcel.depth, 80);
    assert.strictEqual(parcel.height, 8);
    assert.strictEqual(parcel.declaredValue, 15000);
  });

  it('apila alto por cantidad (3 prendas iguales → height 24)', () => {
    process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
    const parcel = buildParcelFromShippingLines(
      [
        {
          codigo: 'L-OF-CA-BMBES7',
          cantidad: 3,
          pesoGrams: 612,
          anchoCm: 50,
          largoCm: 80,
          subrubro: 'CAMPERA',
        },
      ],
      45000
    );
    assert.strictEqual(parcel.weightGrams, 1836);
    assert.strictEqual(parcel.height, 24);
  });

  it('usa fallback de subrubro cuando faltan medidas', () => {
    process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
    const parcel = buildParcelFromShippingLines(
      [
        {
          codigo: 'TEST-CAMP',
          cantidad: 1,
          pesoGrams: 600,
          anchoCm: null,
          largoCm: null,
          subrubro: 'CAMPERA',
        },
      ],
      1000
    );
    assert.strictEqual(parcel.width, 50);
    assert.strictEqual(parcel.depth, 80);
  });

  it('usa fallback de subrubro CAMISA cuando faltan medidas', () => {
    process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
    const parcel = buildParcelFromShippingLines(
      [
        {
          codigo: 'L-OF-CAM-MAN17',
          cantidad: 1,
          pesoGrams: 350,
          anchoCm: null,
          largoCm: null,
          subrubro: 'CAMISA',
        },
      ],
      46990
    );
    assert.strictEqual(parcel.width, 40);
    assert.strictEqual(parcel.depth, 40);
    assert.strictEqual(parcel.weightGrams, 350);
  });

  it('falla si falta peso y no hay fallback', () => {
    assert.throws(
      () =>
        buildParcelFromShippingLines(
          [
            {
              codigo: 'SIN-PESO',
              cantidad: 1,
              pesoGrams: null,
              anchoCm: 30,
              largoCm: 40,
              subrubro: null,
            },
          ],
          100
        ),
      /no tiene peso/
    );
  });
});
