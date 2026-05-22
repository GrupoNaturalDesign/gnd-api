import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

const mockResend = {
  emails: {
    send: mock.fn(async () => ({ data: { id: 'msg-welcome-nl' }, error: null })),
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
    findFirst: mock.fn(async () => null),
    findMany: mock.fn(async () => []),
    findUnique: mock.fn(async () => null),
    create: mock.fn(async () => ({ token: 'test-token-32chars1111111111111111111111' })),
    delete: mock.fn(async () => ({})),
  },
};

mock.module('resend', () => ({ Resend: function () { return mockResend; } }), { virtual: true });
mock.module('../prisma', () => ({ prisma: mockPrisma }), { virtual: true });

function resetAll(): void {
  mockResend.emails.send.mock.resetCalls();
  mockPrisma.emailLog.create.mock.resetCalls();
  mockPrisma.unsubscribeToken.create.mock.resetCalls();
}

describe('emailService.sendNewsletterWelcomeEmail', () => {
  beforeEach(resetAll);

  test('envía email de bienvenida al newsletter y loguea status sent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';
    process.env.NEWSLETTER_UNSUBSCRIBE_BASE_URL = 'https://naturalonline.com.ar';

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletterWelcomeEmail({ email: 'user@test.com' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 1);

    const [sendArgs] = mockResend.emails.send.mock.calls[0].arguments;
    assert.strictEqual(sendArgs.to, 'user@test.com');
    assert.match(sendArgs.subject, /newsletter/i);
    assert.strictEqual(mockPrisma.unsubscribeToken.create.mock.callCount(), 1);
    assert.strictEqual(mockPrisma.emailLog.create.mock.callCount(), 1);

    const logData = mockPrisma.emailLog.create.mock.calls[0].arguments[0].data;
    assert.strictEqual(logData.type, 'newsletter');
    assert.strictEqual(logData.status, 'sent');
    assert.strictEqual(logData.metadata.kind, 'newsletter_welcome');
  });

  test('falla cuando Resend marketing no está configurado', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_MARKETING;

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletterWelcomeEmail({ email: 'user@test.com' });

    assert.strictEqual(result.success, false);
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);
    assert.strictEqual(mockPrisma.emailLog.create.mock.callCount(), 1);

    const logData = mockPrisma.emailLog.create.mock.calls[0].arguments[0].data;
    assert.strictEqual(logData.status, 'failed');
  });
});
