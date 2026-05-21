import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let mockResendError: { statusCode?: number; name?: string; message: string } | null = null;
let mockResendData: unknown = { id: 'msg-123' };
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

function resetAll(): void {
  sendCallCount = 0;
  mockResendError = null;
  mockResendData = { id: 'msg-123' };
  mockResend.emails.send.mock.resetCalls();
  mockResend.batch.send.mock.resetCalls();
  mockPrisma.emailLog.create.mock.resetCalls();
}

describe('emailService.sendWelcomeEmail', () => {
  beforeEach(resetAll);

  test('envía email y loguea status sent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Juan', email: 'juan@test.com' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'msg-123');
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 1);
    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.ok(logCall, 'debe loguear status sent');
    assert.strictEqual(logCall?.arguments[0]?.data?.type, 'welcome');
    assert.strictEqual(logCall?.arguments[0]?.data?.to, 'juan@test.com');
  });

  test('retorna error cuando falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Ana', email: 'ana@test.com' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('RESEND_API_KEY'));
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);
    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall, 'debe loguear status failed');
  });

  test('retorna error cuando falta RESEND_FROM_TRANSACTIONAL', async () => {
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.RESEND_FROM_TRANSACTIONAL;

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Ana', email: 'ana@test.com' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('RESEND_FROM_TRANSACTIONAL'));
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);
  });

  test('retorna error y loguea cuando Resend falla', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 500, message: 'Internal server error' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Luis', email: 'luis@test.com' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Internal server error'));
    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(logCall, 'debe loguear status failed');
    assert.strictEqual(logCall?.arguments[0]?.data?.error, 'Internal server error');
  });

  test('reintenta en error 500 y falla después de 3 intentos', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 500, message: 'Server error' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Pedro', email: 'pedro@test.com' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Server error'));
    assert.strictEqual(sendCallCount, 4, '1 intento + 3 reintentos = 4');
  });

  test('no reintenta en error 400 (validation error)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendError = { statusCode: 400, message: 'Bad request' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Ana', email: 'ana@test.com' });

    assert.strictEqual(result.success, false);
    assert.strictEqual(sendCallCount, 1, 'sin reintentos para error 400');
  });

  test('loggea sent incluso si messageId es undefined', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    mockResendData = {};

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Test', email: 't@t.com' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, undefined);
    const logCall = mockPrisma.emailLog.create.mock.calls.find(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.ok(logCall, 'debe loguear sent');
    assert.strictEqual(logCall?.arguments[0]?.data?.messageId, null);
  });
});