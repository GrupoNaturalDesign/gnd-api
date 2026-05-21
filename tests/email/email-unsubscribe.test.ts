import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

let mockToken: { id: string; email: string; token: string } | null = null;
let deleteCalled = false;

const mockPrisma = {
  emailLog: { create: mock.fn(async () => ({})) },
  unsubscribeToken: {
    findMany: mock.fn(async () => []),
    findUnique: mock.fn(async ({ where }: { where: { token: string } }) => {
      if (where?.token === mockToken?.token) return mockToken;
      return null;
    }),
    create: mock.fn(async (data: { data: { email: string; token: string } }) => ({
      id: 'new-id',
      ...data.data,
    })),
    delete: mock.fn(async () => {
      deleteCalled = true;
      return mockToken;
    }),
  },
};

mock.module('../../../lib/prisma', () => ({ prisma: mockPrisma }), { virtual: true });

function resetAll(): void {
  mockToken = null;
  deleteCalled = false;
  mockPrisma.unsubscribeToken.findUnique.mock.resetCalls();
  mockPrisma.unsubscribeToken.create.mock.resetCalls();
  mockPrisma.unsubscribeToken.delete.mock.resetCalls();
}

describe('unsubscribeService', () => {
  beforeEach(resetAll);

  test('unsubscribe con token válido elimina el registro y retorna success', async () => {
    mockToken = { id: 'tok-id-1', email: 'user@test.com', token: 'valid-token-123' };

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.unsubscribe('valid-token-123');

    assert.strictEqual(result.success, true);
    assert.ok(result.message.includes('user@test.com'));
    assert.strictEqual(deleteCalled, true);
  });

  test('unsubscribe con token inválido retorna error sin eliminar nada', async () => {
    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.unsubscribe('invalid-token');

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('inválido'));
    assert.strictEqual(deleteCalled, false);
  });

  test('isUnsubscribed retorna false si no existe el registro', async () => {
    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.isUnsubscribed('noexiste@test.com');

    assert.strictEqual(result, false);
  });

  test('isUnsubscribed retorna true si existe el registro', async () => {
    mockToken = { id: 'tok-id', email: 'test@test.com', token: 'abc' };

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.isUnsubscribed('test@test.com');

    assert.strictEqual(result, true);
  });

  test('isUnsubscribed normaliza email a lowercase', async () => {
    mockToken = { id: 'tok-id', email: 'User@Test.com', token: 'abc' };

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.isUnsubscribed('USER@TEST.COM');

    assert.strictEqual(result, true);
  });

  test('filterUnsubscribed excluye emails desuscriptos', async () => {
    mockPrisma.unsubscribeToken.findMany.mock.mockImplementationOnce(async () => [
      { email: 'unsubscribed@test.com' },
      { email: 'another@test.com' },
    ]);

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.filterUnsubscribed([
      'active1@test.com',
      'unsubscribed@test.com',
      'active2@test.com',
      'another@test.com',
    ]);

    assert.strictEqual(result.length, 2);
    assert.ok(result.includes('active1@test.com'));
    assert.ok(result.includes('active2@test.com'));
    assert.ok(!result.includes('unsubscribed@test.com'));
    assert.ok(!result.includes('another@test.com'));
  });

  test('filterUnsubscribed con lista vacía retorna vacío', async () => {
    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const result = await unsubscribeService.filterUnsubscribed([]);

    assert.deepStrictEqual(result, []);
  });

  test('createOrGetToken retorna token existente si ya existe', async () => {
    mockToken = { id: 'existing-id', email: 'existing@test.com', token: 'existing-token' };
    mockPrisma.unsubscribeToken.findUnique.mock.mockImplementationOnce(
      async () => mockToken
    );

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const token = await unsubscribeService.createOrGetToken('existing@test.com');

    assert.strictEqual(token, 'existing-token');
    assert.strictEqual(mockPrisma.unsubscribeToken.create.mock.callCount(), 0, 'no crea nuevo');
  });

  test('createOrGetToken crea nuevo token si no existe', async () => {
    mockPrisma.unsubscribeToken.findUnique.mock.mockImplementationOnce(async () => null);
    mockPrisma.unsubscribeToken.create.mock.mockImplementationOnce(
      async (data: { data: { email: string; token: string } }) => ({
        id: 'new-id',
        ...data.data,
      })
    );

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    const token = await unsubscribeService.createOrGetToken('new@test.com');

    assert.strictEqual(token.length, 64, 'token de 32 bytes en hex');
    assert.strictEqual(mockPrisma.unsubscribeToken.create.mock.callCount(), 1);
  });

  test('createOrGetToken normaliza email a lowercase', async () => {
    mockPrisma.unsubscribeToken.findUnique.mock.mockImplementationOnce(async () => null);
    mockPrisma.unsubscribeToken.create.mock.mockImplementationOnce(
      async (data: { data: { email: string; token: string } }) => ({
        id: 'new-id',
        ...data.data,
      })
    );

    const { unsubscribeService } = await import('../../../lib/email/unsubscribe.service');

    await unsubscribeService.createOrGetToken('Test@TEST.COM');

    const createCall = mockPrisma.unsubscribeToken.create.mock.calls[0];
    assert.strictEqual(
      createCall?.arguments[0]?.data?.email,
      'test@test.com',
      'email normalizado a lowercase'
    );
  });
});

describe('GET /api/emails/unsubscribe/:token', () => {
  beforeEach(resetAll);

  test('token válido → 200 success', async () => {
    mockToken = { id: 'tok-1', email: 'user@test.com', token: 'abc123valid' };

    const { getUnsubscribe } = await import('../../../controllers/unsubscribe.controller');
    const mockReq = { params: { token: 'abc123valid' } } as any;
    let responseStatus = 0;
    let responseBody: any;
    const mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return mockRes;
      },
      json: (body: any) => {
        responseBody = body;
        return mockRes;
      },
    };

    await getUnsubscribe(mockReq, mockRes);

    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.message.includes('user@test.com'), true);
  });

  test('token inválido → 404', async () => {
    const { getUnsubscribe } = await import('../../../controllers/unsubscribe.controller');
    const mockReq = { params: { token: 'invalid-token' } } as any;
    let responseStatus = 0;
    let responseBody: any;
    const mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return mockRes;
      },
      json: (body: any) => {
        responseBody = body;
        return mockRes;
      },
    };

    await getUnsubscribe(mockReq, mockRes);

    assert.strictEqual(responseStatus, 404);
    assert.strictEqual(responseBody.success, false);
  });

  test('token muy corto → 400', async () => {
    const { getUnsubscribe } = await import('../../../controllers/unsubscribe.controller');
    const mockReq = { params: { token: 'abc' } } as any;
    let responseStatus = 0;
    let responseBody: any;
    const mockRes = {
      status: (code: number) => {
        responseStatus = code;
        return mockRes;
      },
      json: (body: any) => {
        responseBody = body;
        return mockRes;
      },
    };

    await getUnsubscribe(mockReq, mockRes);

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.success, false);
    assert.ok(responseBody.message.includes('inválido'));
  });
});