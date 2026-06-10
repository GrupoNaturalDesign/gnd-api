import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FormaEnvio } from '@prisma/client';
import {
  httpStatusForPedidoLabelReason,
  resolvePedidoLabelAvailability,
} from '../src/utils/pedido-shipping-label.util';

describe('pedido-shipping-label.util', () => {
  it('retiro en tienda → canDownload false', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: null,
      costoEnvio: 0,
      checkoutEnvioSnapshot: null,
      entregaCp: null,
      andreaniSucursalId: null,
    });
    assert.strictEqual(r.canDownload, false);
    assert.strictEqual(r.reason, 'retiro_tienda');
  });

  it('envío postal sin proveedor → missing_provider', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: null,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: null,
      entregaCp: '5000',
      andreaniSucursalId: null,
    });
    assert.strictEqual(r.canDownload, false);
    assert.strictEqual(r.reason, 'missing_provider');
  });

  it('Correo → correo_portal_only', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: FormaEnvio.correo_domicilio,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: null,
      entregaCp: '5000',
      correoTrackingNumber: 'CR123',
    });
    assert.strictEqual(r.canDownload, false);
    assert.strictEqual(r.provider, 'correo');
    assert.strictEqual(r.reason, 'correo_portal_only');
    assert.strictEqual(r.trackingNumber, 'CR123');
  });

  it('Andreani sin tracking → missing_tracking', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: FormaEnvio.andreani_domicilio,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: {
        provider: 'andreani',
        deliveryType: 'homeDelivery',
      },
      entregaCp: '5000',
    });
    assert.strictEqual(r.canDownload, false);
    assert.strictEqual(r.reason, 'missing_tracking');
    assert.strictEqual(r.provider, 'andreani');
  });

  it('Andreani con tracking sin agrupador → missing_andreani_agrupador', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: FormaEnvio.andreani_sucursal,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: null,
      entregaCp: '5000',
      andreaniNumeroEnvio: '360000102000579',
      andreaniAgrupadorBultos: null,
    });
    assert.strictEqual(r.canDownload, false);
    assert.strictEqual(r.reason, 'missing_andreani_agrupador');
  });

  it('Andreani listo → andreani_ready', () => {
    const r = resolvePedidoLabelAvailability({
      formaEnvio: FormaEnvio.andreani_domicilio,
      costoEnvio: 1500,
      checkoutEnvioSnapshot: {
        provider: 'andreani',
        deliveryType: 'homeDelivery',
      },
      entregaCp: '5000',
      andreaniNumeroEnvio: '360000102000579',
      andreaniAgrupadorBultos: 'GRP-001',
    });
    assert.strictEqual(r.canDownload, true);
    assert.strictEqual(r.reason, 'andreani_ready');
    assert.strictEqual(r.trackingNumber, '360000102000579');
  });

  it('httpStatusForPedidoLabelReason', () => {
    assert.strictEqual(httpStatusForPedidoLabelReason('correo_portal_only'), 422);
    assert.strictEqual(httpStatusForPedidoLabelReason('missing_tracking'), 409);
    assert.strictEqual(httpStatusForPedidoLabelReason('retiro_tienda'), 400);
    assert.strictEqual(httpStatusForPedidoLabelReason('andreani_ready'), 200);
  });
});
