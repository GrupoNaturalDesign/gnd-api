import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { postOrderConfirmation } from '../src/controllers/public-email.controller';

function makeMockResponse() {
  let statusCode = 200;
  let jsonData: unknown;
  return {
    get statusCode() {
      return statusCode;
    },
    get jsonData() {
      return jsonData;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      jsonData = data;
    },
  };
}

afterEach(() => {
  delete process.env.ORDER_CONFIRMATION_EMAIL_SECRET;
});

describe('public order confirmation email endpoint', () => {
  it('rejects calls when internal secret is not configured', async () => {
    const res = makeMockResponse();
    await postOrderConfirmation({ headers: {}, body: {} } as never, res as never);

    assert.equal(res.statusCode, 403);
    assert.equal((res.jsonData as { success: boolean }).success, false);
  });

  it('rejects calls with an invalid internal secret', async () => {
    process.env.ORDER_CONFIRMATION_EMAIL_SECRET = 'expected-secret';
    const res = makeMockResponse();

    await postOrderConfirmation(
      { headers: { 'x-internal-email-secret': 'wrong-secret' }, body: {} } as never,
      res as never
    );

    assert.equal(res.statusCode, 403);
    assert.equal((res.jsonData as { success: boolean }).success, false);
  });
});
