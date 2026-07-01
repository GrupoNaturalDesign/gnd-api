import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  getDefaultWhatsappPhone,
  getDefaultWhatsappMessage,
  getDefaultRetiroDireccion,
  resolveEmailPedidosInternoSync,
} from '../src/services/empresa-tienda-config.service';
import { getCheckoutManualExpiresHours } from '../src/services/pedido-checkout.service';

describe('empresaTiendaConfigService fallbacks', () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, val] of Object.entries(prev)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  function saveEnv(key: string) {
    prev[key] = process.env[key];
  }

  it('getDefaultWhatsappPhone usa BRAND_WHATSAPP_PHONE o default', () => {
    saveEnv('BRAND_WHATSAPP_PHONE');
    delete process.env.BRAND_WHATSAPP_PHONE;
    assert.ok(getDefaultWhatsappPhone().includes('3517'));

    process.env.BRAND_WHATSAPP_PHONE = ' +54 9 111 ';
    assert.strictEqual(getDefaultWhatsappPhone(), '+54 9 111');
  });

  it('getDefaultWhatsappMessage tiene texto por defecto', () => {
    assert.ok(getDefaultWhatsappMessage().length > 10);
  });

  it('getDefaultRetiroDireccion usa STORE_PICKUP_ADDRESS o default', () => {
    saveEnv('STORE_PICKUP_ADDRESS');
    delete process.env.STORE_PICKUP_ADDRESS;
    assert.ok(getDefaultRetiroDireccion().includes('Alta Córdoba'));

    process.env.STORE_PICKUP_ADDRESS = 'Calle Test 99';
    assert.strictEqual(getDefaultRetiroDireccion(), 'Calle Test 99');
  });

  it('plazo pago manual público alineado a 48h por defecto', () => {
    saveEnv('CHECKOUT_MANUAL_EXPIRES_HOURS');
    delete process.env.CHECKOUT_MANUAL_EXPIRES_HOURS;
    assert.strictEqual(getCheckoutManualExpiresHours(), 48);
  });

  it('resolveEmailPedidosInternoSync prioriza admin y cae a RESEND_INTERNAL_TO', () => {
    saveEnv('RESEND_INTERNAL_TO');
    process.env.RESEND_INTERNAL_TO = ' fallback@test.com ';

    assert.strictEqual(resolveEmailPedidosInternoSync(' pedidos@test.com '), 'pedidos@test.com');
    assert.strictEqual(resolveEmailPedidosInternoSync(null), 'fallback@test.com');
    assert.strictEqual(resolveEmailPedidosInternoSync(''), 'fallback@test.com');

    delete process.env.RESEND_INTERNAL_TO;
    assert.strictEqual(resolveEmailPedidosInternoSync(null), null);
  });
});
