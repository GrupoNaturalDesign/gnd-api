import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import test from 'node:test';
import {
  extractMercadoPagoWebhookDataId,
  verifyMercadoPagoWebhookSignature,
} from '../src/utils/mercadopago-webhook-signature';

test('verifyMercadoPagoWebhookSignature acepta manifest oficial', () => {
  const secret = 'unit_test_secret';
  const dataId = '12345678';
  const xRequestId = 'req-abc';
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  const xSignature = `ts=${ts},v1=${v1}`;
  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature,
      xRequestId,
      dataId,
      secret,
      maxSkewSeconds: 600,
    }),
    true
  );
});

test('verifyMercadoPagoWebhookSignature rechaza firma incorrecta', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${ts},v1=deadbeef`,
      xRequestId: 'rid',
      dataId: '1',
      secret: 's',
      maxSkewSeconds: 600,
    }),
    false
  );
});

test('extractMercadoPagoWebhookDataId lee query y body', () => {
  assert.equal(extractMercadoPagoWebhookDataId({ 'data.id': '99' }, {}), '99');
  assert.equal(extractMercadoPagoWebhookDataId({ id: '41141439264' }, {}), '41141439264');
  assert.equal(
    extractMercadoPagoWebhookDataId(
      {},
      { data: { id: 42 }, type: 'payment' }
    ),
    '42'
  );
});
