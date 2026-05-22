import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

const mockResend = {
  emails: {
    send: mock.fn(),
  },
  batch: {
    send: mock.fn(async (emails: unknown[], _opts?: { idempotencyKey?: string }) => {
      return { data: (emails as { to: string[] }[]).map((_, i) => ({ id: `msg-${i}` })), error: null };
    }),
  },
};

const mockPrisma = {
  emailLog: {
    create: mock.fn(async () => ({})),
  },
  newsletterSubscriber: {
    findMany: mock.fn(async () => []),
  },
  unsubscribeToken: {
    findMany: mock.fn(async () => []),
    findFirst: mock.fn(async () => null),
    findUnique: mock.fn(async () => null),
    create: mock.fn(async () => ({ token: 'test-token-32chars1111111111111111111111' })),
  },
};

mock.module('resend', () => ({ Resend: function () { return mockResend; } }), { virtual: true });
mock.module('../prisma', () => ({ prisma: mockPrisma, default: mockPrisma }), { virtual: true });

describe('emailService.sendNewsletter — batch', () => {
  beforeEach(() => {
    mockResend.batch.send.mock.resetCalls();
    mockPrisma.emailLog.create.mock.resetCalls();
  });

  test('usa resend.batch.send en lugar de emails.send individuales', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'Test Newsletter',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['user1@test.com', 'user2@test.com'],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(mockResend.batch.send.mock.callCount(), 1);
    assert.strictEqual(mockResend.emails.send.mock.callCount(), 0);

    const [batchEmails] = mockResend.batch.send.mock.calls[0].arguments;
    assert.strictEqual(batchEmails.length, 2);
    assert.strictEqual(batchEmails[0].to[0], 'user1@test.com');
    assert.strictEqual(batchEmails[1].to[0], 'user2@test.com');
  });

  test('divide en chunks de 100 cuando hay más de 100 destinatarios', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    const { emailService } = await import('../../src/lib/email/email.service');

    const manyRecipients = Array.from({ length: 250 }, (_, i) => `user${i}@test.com`);

    const result = await emailService.sendNewsletter({
      subject: 'Bulk Newsletter',
      htmlBody: '<p>Hola!</p>',
      recipientList: manyRecipients,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(mockResend.batch.send.mock.callCount(), 3);
  });

  test('retorna error cuando la lista está vacía', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'Empty',
      htmlBody: '<p>Hola!</p>',
      recipientList: [],
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('vacía'));
  });

  test('retorna error cuando no está configurado Resend', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_MARKETING;

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'Test',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['user@test.com'],
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('RESEND_FROM_MARKETING'));
  });

  test('registra cada email en EmailLog tras batch', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    const { emailService } = await import('../../src/lib/email/email.service');

    await emailService.sendNewsletter({
      subject: 'Log Test',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['a@test.com', 'b@test.com', 'c@test.com'],
    });

    const logs = mockPrisma.emailLog.create.mock.calls;
    assert.ok(logs.length >= 3, 'debe haber al menos 3 logs (una por destinatario)');
    const types = logs.map((l) => (l.arguments[0] as { data: { type: string } }).data.type);
    assert.ok(types.every((t) => t === 'newsletter'));
  });

  test('usa idempotencyKey única por chunk', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    const { emailService } = await import('../../src/lib/email/email.service');

    await emailService.sendNewsletter({
      subject: 'Idempotency Test',
      htmlBody: '<p>Hola!</p>',
      recipientList: Array.from({ length: 250 }, (_, i) => `user${i}@test.com`),
    });

    const keys = mockResend.batch.send.mock.calls.map((c) => c.arguments[1]?.idempotencyKey);
    assert.strictEqual(keys.length, 3);
    assert.ok(keys.every((k) => k.startsWith('newsletter-') && k.endsWith('/chunk-0') || k.endsWith('/chunk-1') || k.endsWith('/chunk-2')));
  });

  test('filtra destinatarios desuscriptos', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    mockPrisma.newsletterSubscriber.findMany.mock.mockImplementationOnce(async () => [
      { email: 'unsubscribed@test.com' },
    ]);

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'Filter Test',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['active@test.com', 'unsubscribed@test.com'],
    });

    assert.strictEqual(result.success, true);
    const [batchEmails] = mockResend.batch.send.mock.calls[0].arguments;
    assert.strictEqual(batchEmails.length, 1);
    assert.strictEqual(batchEmails[0].to[0], 'active@test.com');
  });

  test('parsea respuesta batch anidada { data: [{ id }] } del SDK de Resend', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    mockResend.batch.send.mock.mockImplementationOnce(async () => ({
      data: { data: [{ id: '58d1921e-1838-4f1f-8eb1-28d3d4d0c138' }] },
      error: null,
    }));

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'Nested Response',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['user@test.com'],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, '58d1921e-1838-4f1f-8eb1-28d3d4d0c138');
  });

  test('retorna error si todos los destinatarios están desuscriptos', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_MARKETING = 'GND <novedades@test.com>';

    mockPrisma.newsletterSubscriber.findMany.mock.mockImplementationOnce(async () => [
      { email: 'user1@test.com' },
      { email: 'user2@test.com' },
    ]);

    const { emailService } = await import('../../src/lib/email/email.service');

    const result = await emailService.sendNewsletter({
      subject: 'All Unsubscribed',
      htmlBody: '<p>Hola!</p>',
      recipientList: ['user1@test.com', 'user2@test.com'],
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('desuscriptos'));
    assert.strictEqual(mockResend.batch.send.mock.callCount(), 0);
  });
});