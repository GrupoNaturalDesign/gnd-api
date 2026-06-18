import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let mockResendError: { statusCode?: number; name?: string; message: string } | null = null;
let mockResendData: unknown = { id: 'msg-internal-999' };
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
  customerName: 'Laura Pérez',
  customerEmail: 'laura@test.com',
  customerPhone: '3517778888',
  shippingSummary: 'Andreani a sucursal - Jesús María',
  paymentSummary: 'Mercado Pago - $25.000',
  items: [{ nombre: 'Camisa blanca talle M', cantidad: 5, subtotalFormatted: '$20.000' }],
  itemCount: 5,
  subtotalFormatted: '$20.000',
  ivaFormatted: '$4.200',
  totalFormatted: '$24.200',
  status: 'PENDING' as const,
};

function resetAll(): void {
  sendCallCount = 0;
  mockResendError = null;
  mockResendData = { id: 'msg-internal-999' };
  mockResend.emails.send.mock.resetCalls();
  mockPrisma.emailLog.create.mock.resetCalls();
}

describe('emailService.sendInternalOrderNotification', () => {
  beforeEach(resetAll);

  test('envía email a RESEND_INTERNAL_TO y loguea sent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendInternalOrderNotification(baseOrder);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'msg-internal-999');
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 1);

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.strictEqual((callArgs as { to: string[] }).to[0], 'equipo@ventas.com');
    assert.ok((callArgs as { subject: string }).subject.includes('Nuevo pedido'));

    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.ok(logCall);
    assert.strictEqual(logCall?.arguments[0]?.data?.type, 'internal');
  });

  test('incluye orderId en subject si existe', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendInternalOrderNotification({ ...baseOrder, orderId: 77 });

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.ok((callArgs as { subject: string }).subject.includes('#77'));
  });

  test('incluye customerName en subject', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendInternalOrderNotification({ ...baseOrder, customerName: 'Pedro Ruiz' });

    const [callArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.ok((callArgs as { subject: string }).subject.includes('Pedro Ruiz'));
  });

  test('retorna error y loguea cuando falta RESEND_INTERNAL_TO', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    delete process.env.RESEND_INTERNAL_TO;

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendInternalOrderNotification(baseOrder);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('RESEND_INTERNAL_TO'));
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);

    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall);
  });

  test('retorna error y loguea failed cuando Resend falla', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';
    mockResendError = { statusCode: 500, message: 'Internal error' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendInternalOrderNotification(baseOrder);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Internal error'));

    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall);
    assert.strictEqual(logCall?.arguments[0]?.data?.type, 'internal');
    assert.strictEqual(logCall?.arguments[0]?.data?.to, 'equipo@ventas.com');
  });

  test('reintenta en error 503 y falla después de agotar retries', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';
    mockResendError = { statusCode: 503, message: 'Service unavailable' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendInternalOrderNotification(baseOrder);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Service unavailable'));
    assert.strictEqual(sendCallCount, 4, '1 intento + 3 reintentos');
  });

  test('no reintenta en error 422 (validation error)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'equipo@ventas.com';
    mockResendError = { statusCode: 422, message: 'Unprocessable entity' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendInternalOrderNotification(baseOrder);

    assert.strictEqual(result.success, false);
    assert.strictEqual(sendCallCount, 1, 'sin reintentos para error 422');
  });
});
