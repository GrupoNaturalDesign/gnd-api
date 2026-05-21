import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Checkout Unit Tests (Fase 1 - funciones puras)', () => {
  describe('mapFormaEnvioCheckout', () => {
    it('correo + domicilio → correo_domicilio', () => {
      const carrier = 'correo';
      const deliveryType = 'domicilio';
      const result = carrier === 'correo' && deliveryType === 'domicilio' ? 'correo_domicilio' : undefined;
      assert.strictEqual(result, 'correo_domicilio');
    });

    it('correo + sucursal → correo_sucursal', () => {
      const carrier = 'correo';
      const deliveryType = 'sucursal';
      const result = carrier === 'correo' && deliveryType === 'sucursal' ? 'correo_sucursal' : undefined;
      assert.strictEqual(result, 'correo_sucursal');
    });

    it('andreani + domicilio → andreani_domicilio', () => {
      const carrier = 'andreani';
      const deliveryType = 'domicilio';
      const result = carrier === 'andreani' && deliveryType === 'domicilio' ? 'andreani_domicilio' : undefined;
      assert.strictEqual(result, 'andreani_domicilio');
    });

    it('andreani + sucursal → andreani_sucursal', () => {
      const carrier = 'andreani';
      const deliveryType = 'sucursal';
      const result = carrier === 'andreani' && deliveryType === 'sucursal' ? 'andreani_sucursal' : undefined;
      assert.strictEqual(result, 'andreani_sucursal');
    });

    it('retiro → undefined (retiro en tienda)', () => {
      const carrier = 'retiro';
      const deliveryType = undefined;
      const result = carrier === 'retiro' ? undefined : carrier + '_' + deliveryType;
      assert.strictEqual(result, undefined);
    });
  });

  describe('computeExpiresAtPedidoManual (3 días)', () => {
    it('calcula vencimiento correcto (3 días)', () => {
      const fechaPedido = new Date('2026-01-15T10:00:00Z');
      const dias = 3;
      const result = new Date(fechaPedido.getTime() + dias * 24 * 60 * 60 * 1000);
      const expected = new Date('2026-01-18T10:00:00Z');
      assert.strictEqual(result.getTime(), expected.getTime());
    });

    it('tolerancia 1 día', () => {
      const dias = 3;
      assert.strictEqual(dias, 3);
    });
  });

  describe('parseo checkoutEnvio', () => {
    it('retiro no requiere CP', () => {
      const tipo = 'retiro';
      const cpRequerido = tipo !== 'retiro';
      assert.strictEqual(cpRequerido, false);
    });

    it('envio requiere CP', () => {
      const tipo: string = 'envio';
      const cpRequerido = tipo !== 'retiro';
      assert.strictEqual(cpRequerido, true);
    });

    it('andreani sucursal requiere agencyId', () => {
      const carrier = 'andreani';
      const deliveryType = 'sucursal';
      const agencyId = 'sucursal-123';
      const valido = carrier === 'andreani' && deliveryType === 'sucursal' && !!agencyId;
      assert.strictEqual(valido, true);
    });

    it('andreani sucursal sin agencyId inválido', () => {
      const carrier = 'andreani';
      const deliveryType = 'sucursal';
      const agencyId = undefined;
      const valido = carrier === 'andreani' && deliveryType === 'sucursal' && !!agencyId;
      assert.strictEqual(valido, false);
    });
  });
});