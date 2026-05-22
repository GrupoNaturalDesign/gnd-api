import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isRetiroEnTienda,
  resolvePedidoEntrega,
  resolvePedidoEntregaFromPedido,
} from '../src/utils/pedido-entrega.util';

describe('pedido-entrega.util', () => {
  it('detecta retiro en tienda sin formaEnvio ni snapshot', () => {
    const info = resolvePedidoEntrega({
      formaEnvio: null,
      costoEnvio: 0,
      checkoutEnvioSnapshot: null,
      entregaCp: null,
      andreaniSucursalId: null,
    }, { orderRef: 'WEB-47' });

    assert.strictEqual(info.tipo, 'retiro_tienda');
    assert.strictEqual(info.shippingSummary, 'Retiro en tienda');
    assert.ok(info.deliveryInstructions?.includes('WEB-47'));
    assert.ok(info.deliveryInstructions?.includes('Alta Córdoba'));
  });

  it('clasifica envío a domicilio desde snapshot', () => {
    const info = resolvePedidoEntrega({
      formaEnvio: null,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: {
        provider: 'andreani',
        deliveryType: 'homeDelivery',
        cpDestino: '5000',
        address: {
          streetName: 'Av. Colón',
          streetNumber: '100',
          city: 'Córdoba',
          zipCode: '5000',
        },
      },
    });

    assert.strictEqual(info.tipo, 'envio_domicilio');
    assert.ok(info.shippingSummary.includes('Andreani'));
    assert.ok(info.deliveryInstructions?.includes('despachemos'));
  });

  it('clasifica retiro en sucursal desde snapshot', () => {
    const info = resolvePedidoEntrega({
      formaEnvio: null,
      costoEnvio: 800,
      checkoutEnvioSnapshot: {
        provider: 'correo',
        deliveryType: 'agency',
        agencyLabel: 'Sucursal Centro',
        cpDestino: '5000',
      },
    });

    assert.strictEqual(info.tipo, 'envio_sucursal');
    assert.ok(info.shippingSummary.includes('Sucursal Centro'));
  });

  it('isRetiroEnTienda es true solo para retiro local', () => {
    assert.strictEqual(
      isRetiroEnTienda({ formaEnvio: null, costoEnvio: 0, checkoutEnvioSnapshot: null }),
      true
    );
    assert.strictEqual(
      isRetiroEnTienda({
        formaEnvio: null,
        costoEnvio: 500,
        checkoutEnvioSnapshot: { provider: 'andreani', deliveryType: 'homeDelivery' },
      }),
      false
    );
  });

  it('resolvePedidoEntregaFromPedido usa sfactoryExternalOrderId', () => {
    const info = resolvePedidoEntregaFromPedido({
      id: 47,
      sfactoryExternalOrderId: 'WEB-47',
      formaEnvio: null,
      costoEnvio: 0,
      checkoutEnvioSnapshot: null,
    });
    assert.ok(info.deliveryInstructions?.includes('WEB-47'));
  });
});
