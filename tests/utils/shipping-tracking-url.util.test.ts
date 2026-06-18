import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildShippingTrackingUrl } from '../../src/utils/shipping-tracking-url.util';

describe('buildShippingTrackingUrl', () => {
  it('andreani usa URL pública por defecto', () => {
    delete process.env.ANDREANI_TRACKING_URL;
    const url = buildShippingTrackingUrl('andreani', '360000102000579');
    assert.ok(url?.includes('andreani.com'));
    assert.ok(url?.includes('360000102000579'));
  });

  it('correo usa portal MiCorreo por defecto (sin id en query)', () => {
    delete process.env.CORREO_TRACKING_URL;
    const url = buildShippingTrackingUrl('correo', 'PAQ123456');
    assert.strictEqual(url, 'https://www.correoargentino.com.ar/MiCorreo');
  });

  it('correo respeta template custom por env con placeholder', () => {
    process.env.CORREO_TRACKING_URL = 'https://track.example/{trackingNumber}';
    const url = buildShippingTrackingUrl('correo', 'PAQ123456');
    assert.strictEqual(url, 'https://track.example/PAQ123456');
    delete process.env.CORREO_TRACKING_URL;
  });

  it('respeta template custom por env', () => {
    process.env.ANDREANI_TRACKING_URL = 'https://track.example/{trackingNumber}';
    const url = buildShippingTrackingUrl('andreani', 'ABC 123');
    assert.strictEqual(url, 'https://track.example/ABC%20123');
    delete process.env.ANDREANI_TRACKING_URL;
  });

  it('devuelve undefined sin número', () => {
    assert.strictEqual(buildShippingTrackingUrl('correo', '   '), undefined);
  });
});
