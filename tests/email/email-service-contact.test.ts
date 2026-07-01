import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let customerError: { statusCode?: number; name?: string; message: string } | null = null;
let teamError: { statusCode?: number; name?: string; message: string } | null = null;
let customerData: unknown = { id: 'msg-customer-789' };
let teamData: unknown = { id: 'msg-team-101' };
let sendCallCount = 0;

const mockResend = {
  emails: {
    send: mock.fn(async () => {
      sendCallCount++;
      if (customerError) {
        const err = customerError;
        customerError = null;
        return { data: null, error: err };
      }
      if (teamError) {
        const err = teamError;
        teamError = null;
        return { data: null, error: err };
      }
      const first = customerData ?? teamData;
      customerData = null;
      return { data: first, error: null };
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

const contactData = {
  email: 'consulta@empresa.com',
  empresa: 'Distribuidora Norte SRL',
  telefono: '3515551234',
  mensaje: 'Necesito cotizar 50 uniformes para mi empresa.',
  nombreCompleto: 'Carlos Rodríguez',
};

function resetAll(): void {
  sendCallCount = 0;
  customerError = null;
  teamError = null;
  customerData = { id: 'msg-customer-789' };
  teamData = { id: 'msg-team-101' };
  mockResend.emails.send.mock.resetCalls();
  mockPrisma.emailLog.create.mock.resetCalls();
}

describe('emailService.sendContactConfirmation', () => {
  beforeEach(resetAll);

  test('envía email al cliente y al equipo de ventas, retorna success', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'ventas@test.com';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendContactConfirmation(contactData);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'msg-customer-789');
    assert.strictEqual(sendCallCount, 2, 'un email al cliente + uno al equipo');

    const customerCall = mockResend.emails.send.mock.calls[0];
    assert.strictEqual((customerCall.arguments[0] as { to: string[] }).to[0], 'consulta@empresa.com');
    assert.ok((customerCall.arguments[0] as { subject: string }).subject.includes('Confirmación'));

    const teamCall = mockResend.emails.send.mock.calls[1];
    assert.strictEqual((teamCall.arguments[0] as { to: string[] }).to[0], 'ventas@test.com');
    assert.ok((teamCall.arguments[0] as { subject: string }).subject.includes('Distribuidora Norte'));
  });

  test('loggea sent para ambos envíos', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'ventas@test.com';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendContactConfirmation(contactData);

    const sentLogs = mockPrisma.emailLog.create.mock.calls.filter(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.strictEqual(sentLogs.length, 2, 'debe loguear sent para cliente y equipo');
    const types = sentLogs.map((l) => l.arguments[0]?.data?.type);
    assert.ok(types.includes('contact'), 'log cliente');
    assert.ok(types.includes('internal'), 'log equipo');
  });

  test('si falla email al cliente, no envía al equipo y retorna error', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'ventas@test.com';
    customerError = { statusCode: 500, message: 'Server error' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendContactConfirmation(contactData);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Server error'));
    assert.strictEqual(sendCallCount, 1, 'solo intenta el cliente, no llega al equipo');
    const teamCall = mockResend.emails.send.mock.calls.find(
      (c) => (c.arguments[0] as { to: string[] }).to[0] === 'ventas@test.com'
    );
    assert.strictEqual(teamCall, undefined, 'no se llama al equipo');
  });

  test('si falla email al equipo, retorna error pero el cliente sí se envió', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'ventas@test.com';
    teamError = { statusCode: 500, message: 'Internal error' };

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendContactConfirmation(contactData);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Internal error'));
    assert.strictEqual(sendCallCount, 2, 'cliente + equipo (que falla)');

    const sentLogs = mockPrisma.emailLog.create.mock.calls.filter(
      (c) => c.arguments[0]?.data?.status === 'sent'
    );
    assert.ok(sentLogs.some((l) => l.arguments[0]?.data?.type === 'contact'));
    const failedLogs = mockPrisma.emailLog.create.mock.calls.filter(
      (c) => c.arguments[0]?.data?.status === 'failed'
    );
    assert.ok(failedLogs.some((l) => l.arguments[0]?.data?.type === 'internal'));
  });

  test('retorna error cuando falta RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendContactConfirmation(contactData);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('RESEND_API_KEY'));
    assert.strictEqual(sendCallCount, 0);
  });

  test('usa RESEND_INTERNAL_TO como destinatario del equipo', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    process.env.RESEND_INTERNAL_TO = 'atencion@empresa.com';

    const { emailService } = await import('../../../lib/email/email.service');

    await emailService.sendContactConfirmation(contactData);

    const teamCall = mockResend.emails.send.mock.calls.find(
      (c) => (c.arguments[0] as { to: string[] }).to[0] !== 'consulta@empresa.com'
    );
    assert.ok(teamCall);
    assert.strictEqual((teamCall!.arguments[0] as { to: string[] }).to[0], 'atencion@empresa.com');
  });
});