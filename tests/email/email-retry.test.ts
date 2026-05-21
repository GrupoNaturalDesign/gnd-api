import { test, describe } from 'node:test';
import assert from 'node:assert';

const mockPrisma = {
  emailLog: { create: mock.fn(async () => ({})) },
  unsubscribeToken: {
    findMany: mock.fn(async () => []),
    findUnique: mock.fn(async () => null),
    create: mock.fn(async () => ({})),
    delete: mock.fn(async () => ({})),
  },
};

const mockResend = {
  emails: { send: mock.fn(async () => ({ data: null, error: null })) },
  batch: { send: mock.fn(async () => ({ data: [], error: null })) },
};

mock.module('resend', () => ({ Resend: function () { return mockResend; } }), { virtual: true });
mock.module('../../../lib/prisma', () => ({ prisma: mockPrisma }), { virtual: true });

function isRetryableResendError(error: {
  statusCode?: number;
  name?: string;
  message?: string;
}): boolean {
  if (!error) return false;
  const code = error.statusCode;
  if (code === undefined) {
    return error.name === 'api_error' || error.name === 'rate_limit_exceeded';
  }
  return code >= 500 || code === 429;
}

describe('isRetryableResendError', () => {
  test('true para 500 Internal server error', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 500, message: 'err' }), true);
  });

  test('true para 502 Bad gateway', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 502, message: 'err' }), true);
  });

  test('true para 503 Service unavailable', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 503, message: 'err' }), true);
  });

  test('true para 429 Rate limit', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 429, message: 'err' }), true);
  });

  test('false para 400 Bad request', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 400, message: 'err' }), false);
  });

  test('false para 401 Unauthorized', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 401, message: 'err' }), false);
  });

  test('false para 403 Forbidden', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 403, message: 'err' }), false);
  });

  test('false para 422 Unprocessable entity', () => {
    assert.strictEqual(isRetryableResendError({ statusCode: 422, message: 'err' }), false);
  });

  test('false para null / undefined', () => {
    assert.strictEqual(isRetryableResendError(null!), false);
    assert.strictEqual(isRetryableResendError(undefined!), false);
  });

  test('true para error con name api_error sin statusCode', () => {
    assert.strictEqual(isRetryableResendError({ name: 'api_error', message: 'err' }), true);
  });

  test('true para error con name rate_limit_exceeded sin statusCode', () => {
    assert.strictEqual(
      isRetryableResendError({ name: 'rate_limit_exceeded', message: 'err' }),
      true
    );
  });

  test('false para otros nombres de error', () => {
    assert.strictEqual(isRetryableResendError({ name: 'validation_error', message: 'err' }), false);
    assert.strictEqual(isRetryableResendError({ name: 'not_found', message: 'err' }), false);
  });
});

describe('retry exponential backoff', () => {
  test('reintentos agotados con error 500 → retorna tras 4 intentos', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    let attempts = 0;

    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: null, error: { statusCode: 500, message: 'Server error' } };
    });
    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: null, error: { statusCode: 500, message: 'Server error' } };
    });
    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: null, error: { statusCode: 500, message: 'Server error' } };
    });
    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: null, error: { statusCode: 500, message: 'Server error' } };
    });

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Test', email: 't@t.com' });

    assert.strictEqual(result.success, false);
    assert.strictEqual(attempts, 4);
  });

  test('error 500 se recupera en el segundo intento → retorna success', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM_TRANSACTIONAL = 'GND <pedidos@test.com>';
    let attempts = 0;

    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: null, error: { statusCode: 500, message: 'Server error' } };
    });
    mockResend.emails.send.mock.mockImplementationOnce(async () => {
      attempts++;
      return { data: { id: 'msg-recovered' }, error: null };
    });

    const { emailService } = await import('../../../lib/email/email.service');

    const result = await emailService.sendWelcomeEmail({ name: 'Test', email: 't@t.com' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.messageId, 'msg-recovered');
    assert.strictEqual(attempts, 2);
  });
});