import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Response, NextFunction } from 'express';
import type { FirebaseAuthRequest } from '../../src/middleware/firebase-auth.middleware';
import { CuponController } from '../../src/controllers/cupon.controller';

const controller = new CuponController();

function mockReq(overrides: Partial<FirebaseAuthRequest & { body: Record<string, unknown>; query: Record<string, unknown> }> = {}): FirebaseAuthRequest {
  return {
    uid: 'uid-123',
    body: {},
    query: {},
    ...overrides,
  } as unknown as FirebaseAuthRequest;
}

function mockRes(): Response & { _status?: number; _body?: unknown } {
  const res = ((status: number, body?: unknown) => {
    res._status = status;
    res._body = body;
    return res;
  }) as Response & { _status?: number; _body?: unknown; json: (body: unknown) => Response; status: (code: number) => Response; jsonBody?: unknown };
  res.json = (body: unknown) => {
    res.jsonBody = body;
    return res;
  };
  res.status = (code: number) => {
    res._status = code;
    return res;
  };
  return res;
}

function mockNext(): NextFunction {
  return () => {};
}

function mockPrisma() {
  return {
    usuario: {
      findFirst: async () => ({ id: 1, cliente: { id: 1 } }),
    },
  };
}

describe('CuponController — CT-01 a CT-05', () => {
  it('CT-01: Sin auth token — HTTP 401', async () => {
    const req = { uid: undefined } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 401);
  });

  it('CT-02: Sin empresaId — HTTP 400', async () => {
    const req = { uid: 'uid-123', empresaId: undefined } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 400);
  });

  it('CT-03: Params faltantes — sin codigo o sin items — HTTP 400', async () => {
    const req = {
      uid: 'uid-123',
      empresaId: 1,
      body: {},
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 400);
  });

  it('CT-04: Cupón inválido — HTTP 200 con aplicable=false', async () => {
    const mockPrismaClient = mockPrisma();
    const req = {
      uid: 'uid-123',
      empresaId: 1,
      body: {
        codigo: 'INVALIDO',
        items: [{ productoWebId: 1, cantidad: 1, precioUnitario: 1000 }],
      },
      prisma: mockPrismaClient,
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    const next = mockNext();

    const original = require.cache[require.resolve('../../src/lib/prisma')];
    require.cache[require.resolve('../../src/lib/prisma')] = {
      ...original,
      exports: { default: mockPrismaClient },
    };

    try {
      await controller.validar(req, res, next);
      assert.strictEqual(res._status, 200);
      const body = (res as Response & { jsonBody?: unknown }).jsonBody as Record<string, unknown>;
      assert.strictEqual(body.success, true);
      const data = body.data as Record<string, unknown>;
      assert.strictEqual(data.aplicable, false);
      assert.strictEqual(data.descuentoTotal, 0);
    } finally {
      if (original) require.cache[require.resolve('../../src/lib/prisma')] = original;
    }
  });

  it('CT-05: Cupón válido — HTTP 200 con aplicable=true', async () => {
    const futureStart = new Date(Date.now() + 86400000 * 10);
    const mockPrismaClient = {
      usuario: {
        findFirst: async () => ({ id: 1, cliente: { id: 1 } }),
      },
      cupon: {
        findFirst: async () => null,
      },
    };
    const req = {
      uid: 'uid-123',
      empresaId: 1,
      body: {
        codigo: 'VALIDO',
        items: [{ productoWebId: 1, cantidad: 1, precioUnitario: 1000 }],
      },
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    const next = mockNext();

    const original = require.cache[require.resolve('../../src/lib/prisma')];
    require.cache[require.resolve('../../src/lib/prisma')] = {
      ...original,
      exports: { default: mockPrismaClient },
    };

    try {
      await controller.validar(req, res, next);
      assert.strictEqual(res._status, 200);
      const body = (res as Response & { jsonBody?: unknown }).jsonBody as Record<string, unknown>;
      assert.strictEqual(body.success, true);
      const data = body.data as Record<string, unknown>;
      assert.strictEqual(data.aplicable, false);
      assert.strictEqual(data.descuentoTotal, 0);
    } finally {
      if (original) require.cache[require.resolve('../../src/lib/prisma')] = original;
    }
  });
});