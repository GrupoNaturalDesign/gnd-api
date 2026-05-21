import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let mockResendError: { statusCode?: number; name?: string; message: string } | null = null;
let mockResendData: unknown = { id: 'msg-456' };
let sendCallCount = 0;

const mockResend = {
  emails: {
    send: mock.fn(async () => {
      sendCallCount++;
      if (mockResendError) {
        const err = mockResendError;
        mockResendError = null;
        return { data: null, error: err };
      }
      return { data: mockResendData, error: null };
    }),
  },
  batch: {
    send: mock.fn(async () => ({ data: [], error: null })),
  },
};

const mockPrisma = {
  emailLog: {
    create: mock.fn(async () => ({})),
  },
  unsubscribeToken: {
    findMany: mock.fn(async () => []),
    findUnique: mock.fn(async () => null),
    create: mock.fn(async () => ({ token: 'tok' })),
    delete: mock.fn(async () => ({})),
  },
};

mock.module('resend', () => ({ Resend: function () { return mockResend; } }), { virtual: true });
mock.module('../../../lib/prisma', () => ({ prisma: mockPrisma }), { virtual: true });

const baseOrder = {
  customerName: 'María López',
  customerEmail: 'maria@test.com',
  customerPhone: '3511234567',
  shippingSummary: 'Andreani a domicilio - Córdoba',
  paymentSummary: 'Mercado Pago - $12.500',
  items: [{ nombre: 'Uniforme médico x1', cantidad: 2, subtotalFormatted: '$10.000' }],
  itemCount: 2,
  subtotalFormatted: '$10.000',
  ivaFormatted: '$2.100',
  totalFormatted: '$12.100',
  status: 'CONFIRMED' as const,
};

function resetAll(): void {
  sendCallCount = 0;
  mockResendError = null;
  mockResendData = { id: 'msg-456' };
  mockResend.emails.send.mock.resetCalls();
  mockResend.batch.send.mock.resetCalls();
  mockPrisma.emailLog.create.mock.resetCalls();
}

describe('emailService.sendOrderStatusEmail', () => {
  beforeEach(resetAll);

  test('envía email con estado CONFIRMED y loguea sent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendOrderStatusEmail(baseOrder);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'msg-456');
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 1);

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.ok((callArgs as { subject: string }).subject.includes('confirmado'));

    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.ok(logCall);
    assert.strictEqual(logCall?.arguments[0]?.data?.type, 'order_status');
    assert.strictEqual(logCall?.arguments[0]?.data?.to, 'maria@test.com');
  });

  test('incluye orderId en el subject si existe', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendOrderStatusEmail({ ...baseOrder, orderId: 42 });

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.ok((callArgs as { subject: string }).subject.includes('#42'));
  });

  test('incluye datos del cliente en el payload', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendOrderStatusEmail(baseOrder);

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.strictEqual((callArgs as { to: string[] }).to[0], 'maria@test.com');
    assert.strictEqual((callArgs as { html: string }).html.length > 0, true);
    assert.strictEqual((callArgs as { text: string }).text.length > 0, true);
  });

  test('retorna error y loguea failed cuando Resend falla', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 500, message: 'Service unavailable' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendOrderStatusEmail(baseOrder);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Service unavailable'));

    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall);
    assert.strictEqual(logCall?.arguments[0]?.data?.error, 'Service unavailable');
  });

  test('reintenta en error 429 (rate limit) y falla después de agotar retries', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 429, message: 'Rate limit exceeded' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendOrderStatusEmail(baseOrder);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Rate limit exceeded'));
    assert.strictEqual(sendCallCount, 4, '1 intento + 3 reintentos');
  });

  test('no reintenta en error 401 (invalid api key)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 401, message: 'Unauthorized' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendOrderStatusEmail(baseOrder);

    assert.strictEqual(result.success, false);
    assert.strictEqual(sendCallCount, 1, 'sin reintentos para error 401');
  });

  test('retorna error cuando falta from address', async () => {
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.RESEND_FROM_TRANSACTIONAL;

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendOrderStatusEmail(baseOrder);

    assert.strictEqual(result.success, false);
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);
    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall);
  });
});