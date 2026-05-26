import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import test from 'node:test';
import {
  extractMercadoPagoWebhookDataId,
  verifyMercadoPagoWebhookSignature,
} from '../src/utils/mercadopago-webhook-signature';
import {
  buildWebhookResponseMessage,
  mapWebhookResultToLogPatch,
  shouldReturn500ForWebhookResult,
} from '../src/services/mp-webhook-log.service';

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

test('shouldReturn500ForWebhookResult solo con payment unknown', () => {
  assert.equal(
    shouldReturn500ForWebhookResult({
      pedidoId: null,
      paymentStatus: 'unknown',
      procesado: false,
    }),
    true
  );
  assert.equal(
    shouldReturn500ForWebhookResult({
      pedidoId: 50,
      paymentStatus: 'pending',
      procesado: false,
    }),
    false
  );
});

test('mapWebhookResultToLogPatch distingue processed, skipped y validation_failed', () => {
  assert.deepEqual(
    mapWebhookResultToLogPatch(
      { pedidoId: 50, paymentStatus: 'approved', procesado: true },
      false
    ),
    { outcome: 'processed', mpStatus: 'approved', pedidoId: 50, detail: undefined }
  );
  assert.deepEqual(
    mapWebhookResultToLogPatch(
      { pedidoId: null, paymentStatus: 'unknown', procesado: false },
      false
    ),
    { outcome: 'skipped', mpStatus: 'unknown', pedidoId: null, detail: 'payment_not_found' }
  );
  assert.deepEqual(
    mapWebhookResultToLogPatch(
      { pedidoId: 50, paymentStatus: 'approved', procesado: false },
      false
    ),
    {
      outcome: 'validation_failed',
      mpStatus: 'approved',
      pedidoId: 50,
      detail: 'confirm_not_completed',
    }
  );
});

test('buildWebhookResponseMessage cubre duplicados y stale received', () => {
  assert.equal(
    buildWebhookResponseMessage(
      { pedidoId: 50, paymentStatus: 'approved', procesado: true },
      false,
      false
    ),
    'processed'
  );
  assert.equal(
    buildWebhookResponseMessage(
      { pedidoId: 50, paymentStatus: 'approved', procesado: true, alreadyProcessed: true },
      true,
      false
    ),
    'duplicate_already_processed'
  );
  assert.equal(
    buildWebhookResponseMessage(
      { pedidoId: 50, paymentStatus: 'approved', procesado: true },
      true,
      true
    ),
    'duplicate_reprocessed'
  );
  assert.equal(
    buildWebhookResponseMessage(
      { pedidoId: null, paymentStatus: 'unknown', procesado: false },
      false,
      false
    ),
    'payment_not_found'
  );
});
