import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { parseCheckoutEnvio } from '../../../src/lib/parse-checkout-envio';
import { parseParcelForCheckout } from '../../../src/lib/parse-checkout-parcel';

describe('Checkout Integration Tests (CH-01 to CH-07)', () => {
  describe('CH-01: parseCheckoutEnvio retiro → sin formaEnvio', () => {
    it('retiro en tienda retorna undefined para formaEnvio', () => {
      const input = {
        tipo: 'retiro' as const,
      };
      const result = parseCheckoutEnvio(input);
      assert.strictEqual(result.formaEnvio, undefined);
    });

    it('retiro no requiere CP', () => {
      const input = {
        tipo: 'retiro' as const,
      };
      const result = parseCheckoutEnvio(input);
      assert.ok(result.ok);
    });
  });

  describe('CH-02: parseCheckoutEnvio correo domicilio', () => {
    it('correo domicilio con CP válido', () => {
      const input = {
        tipo: 'envio',
        carrier: 'correo',
        deliveryType: 'homeDelivery' as const,
        direccion: {
          calle: 'Calle Falsa',
          numero: '123',
          ciudad: 'Córdoba',
          provincia: 'Cordoba',
          codigoPostal: '5000',
        },
      };
      const result = parseCheckoutEnvio(input);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.formaEnvio, 'correo_domicilio');
    });

    it('correo domicilio sin CP lanza', () => {
      const input = {
        tipo: 'envio',
        carrier: 'correo',
        deliveryType: 'homeDelivery' as const,
        direccion: {
          calle: 'Calle Falsa',
          numero: '123',
          ciudad: 'Córdoba',
          provincia: 'Cordoba',
          codigoPostal: '',
        },
      };
      const result = parseCheckoutEnvio(input);
      assert.strictEqual(result.ok, false);
    });
  });

  describe('CH-03: parseCheckoutEnvio andreani sucursal', () => {
    it('andreani sucursal con agencyId', () => {
      const input = {
        tipo: 'envio',
        carrier: 'andreani',
        deliveryType: 'agency' as const,
        agencyId: 'sucursal-123',
      };
      const result = parseCheckoutEnvio(input);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.formaEnvio, 'andreani_sucursal');
      assert.strictEqual(result.direccion?.sucursalId, 'sucursal-123');
    });

    it('andreani sucursal sin agencyId lanza', () => {
      const input = {
        tipo: 'envio',
        carrier: 'andreani',
        deliveryType: 'agency' as const,
      };
      const result = parseCheckoutEnvio(input);
      assert.strictEqual(result.ok, false);
    });
  });

  describe('CH-04: parseParcelForCheckout', () => {
    it('parsea peso y dimensiones correctas', () => {
      const input = {
        weightGrams: 500,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
      };
      const result = parseParcelForCheckout(input);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.parcel.weightGrams, 500);
    });

    it('peso 0 lanza error', () => {
      const input = {
        weightGrams: 0,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
      };
      const result = parseParcelForCheckout(input);
      assert.strictEqual(result.ok, false);
    });

    it('peso negativo lanza error', () => {
      const input = {
        weightGrams: -100,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
      };
      const result = parseParcelForCheckout(input);
      assert.strictEqual(result.ok, false);
    });
  });
});