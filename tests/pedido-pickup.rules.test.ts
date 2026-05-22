import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EstadoPedido } from '@prisma/client';
import {
  validateEnviarListoParaRetiro,
  validateMarcarPedidoRetirado,
} from '../src/services/pedido-pickup.rules';

const baseRetiro = {
  formaEnvio: null,
  costoEnvio: 0,
  checkoutEnvioSnapshot: null,
  entregaCp: null,
  andreaniSucursalId: null,
  estadoInterno: EstadoPedido.confirmado,
};

describe('pedido-pickup.rules', () => {
  describe('validateEnviarListoParaRetiro', () => {
    it('acepta retiro confirmado', () => {
      assert.doesNotThrow(() => validateEnviarListoParaRetiro(baseRetiro));
    });

    it('acepta procesando y despachado', () => {
      assert.doesNotThrow(() =>
        validateEnviarListoParaRetiro({ ...baseRetiro, estadoInterno: EstadoPedido.procesando })
      );
      assert.doesNotThrow(() =>
        validateEnviarListoParaRetiro({ ...baseRetiro, estadoInterno: EstadoPedido.despachado })
      );
    });

    it('rechaza envío postal', () => {
      assert.throws(
        () =>
          validateEnviarListoParaRetiro({
            ...baseRetiro,
            costoEnvio: 1500,
            checkoutEnvioSnapshot: { provider: 'andreani', deliveryType: 'homeDelivery' },
          }),
        /no es retiro en tienda/
      );
    });

    it('rechaza pendiente de confirmación', () => {
      assert.throws(
        () =>
          validateEnviarListoParaRetiro({
            ...baseRetiro,
            estadoInterno: EstadoPedido.pendiente_confirmacion,
          }),
        /aún no está confirmado/
      );
    });

    it('rechaza entregado', () => {
      assert.throws(
        () =>
          validateEnviarListoParaRetiro({
            ...baseRetiro,
            estadoInterno: EstadoPedido.entregado,
          }),
        /ya fue entregado/
      );
    });

    it('rechaza cancelado', () => {
      assert.throws(
        () =>
          validateEnviarListoParaRetiro({
            ...baseRetiro,
            estadoInterno: EstadoPedido.cancelado,
          }),
        /cancelado o vencido/
      );
    });
  });

  describe('validateMarcarPedidoRetirado', () => {
    it('acepta retiro confirmado', () => {
      assert.deepStrictEqual(validateMarcarPedidoRetirado(baseRetiro), { alreadyDelivered: false });
    });

    it('retorna alreadyDelivered si ya entregado', () => {
      assert.deepStrictEqual(
        validateMarcarPedidoRetirado({ ...baseRetiro, estadoInterno: EstadoPedido.entregado }),
        { alreadyDelivered: true }
      );
    });

    it('rechaza envío postal', () => {
      assert.throws(
        () =>
          validateMarcarPedidoRetirado({
            ...baseRetiro,
            formaEnvio: 'andreani_domicilio',
            costoEnvio: 1200,
          }),
        /no es retiro en tienda/
      );
    });

    it('rechaza pendiente de confirmación', () => {
      assert.throws(
        () =>
          validateMarcarPedidoRetirado({
            ...baseRetiro,
            estadoInterno: EstadoPedido.pendiente_confirmacion,
          }),
        /no puede marcarse como retirado/
      );
    });
  });
});
