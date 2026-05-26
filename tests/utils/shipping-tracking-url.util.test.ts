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

  it('correo usa URL pública por defecto', () => {
    delete process.env.CORREO_TRACKING_URL;
    const url = buildShippingTrackingUrl('correo', 'PAQ123456');
    assert.ok(url?.includes('correoargentino.com.ar'));
    assert.ok(url?.includes('PAQ123456'));
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
