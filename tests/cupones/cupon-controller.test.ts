import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import type { Response, NextFunction } from 'express';
import type { FirebaseAuthRequest } from '../../src/middleware/firebase-auth.middleware';
import { CuponController } from '../../src/controllers/cupon.controller';
import type { CuponValidacionResultado } from '../../src/services/cupon-engine.service';

function mockRes(): Response & { _status?: number; _body?: unknown } {
  const res = {} as Response & { _status?: number; _body?: unknown };
  res.json = function (body: unknown) { res._body = body; return res; };
  res.status = function (code: number) { res._status = code; return res; };
  return res;
}

function mockNext(): NextFunction {
  return () => {};
}

function makeUsuarioFindFirst(usuario: unknown) {
  return mock.fn(() => Promise.resolve(usuario));
}

const USUARIO_VALIDO = { id: 10, cliente: { id: 20 } };

describe('CuponController — validar', () => {
  it('CT-01: Sin uid — HTTP 401', async () => {
    const prisma = { usuario: { findFirst: makeUsuarioFindFirst(null) } };
    const controller = new CuponController(prisma as never);
    const req = { uid: undefined, empresaId: 1 } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 401);
  });

  it('CT-02: Sin empresaId — HTTP 400 (se evalúa antes que uid)', async () => {
    const prisma = { usuario: { findFirst: makeUsuarioFindFirst(null) } };
    const controller = new CuponController(prisma as never);
    const req = { uid: undefined, empresaId: undefined } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 400);
  });

  it('CT-03: Body params faltantes — HTTP 400', async () => {
    const prisma = { usuario: { findFirst: makeUsuarioFindFirst(USUARIO_VALIDO) } };
    const controller = new CuponController(prisma as never);
    const req = {
      uid: 'uid-1',
      empresaId: 1,
      body: {},
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 400);
    assert.ok((res._body as { error?: string })?.error?.includes('Faltan parámetros'));
  });

  it('CT-04: Cupón inválido — HTTP 200, aplicable=false', async () => {
    const prisma = { usuario: { findFirst: makeUsuarioFindFirst(USUARIO_VALIDO) } };
    const cuponEngine = {
      validarCupon: mock.fn<() => Promise<CuponValidacionResultado>>(() =>
        Promise.resolve({ valido: false, error: 'Cupón no aplicable' })
      ),
    };
    const controller = new CuponController(prisma as never, cuponEngine as never);
    const req = {
      uid: 'uid-1',
      empresaId: 1,
      body: { codigo: 'INVALIDO', items: [{ productoWebId: 1, cantidad: 1, precioUnitario: 100 }] },
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 200);
    assert.strictEqual((res._body as { data: { aplicable: boolean } }).data.aplicable, false);
  });

  it('CT-05: Cupón válido — HTTP 200, aplicable=true, descuentoTotal>0', async () => {
    const prisma = { usuario: { findFirst: makeUsuarioFindFirst(USUARIO_VALIDO) } };
    const cuponEngine = {
      validarCupon: mock.fn<() => Promise<CuponValidacionResultado>>(() =>
        Promise.resolve({
          valido: true,
          detalle: {
            cuponId: 1,
            codigo: 'DESC10',
            nombre: '10% OFF',
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            alcance: 'carrito_completo',
            descuentoTotal: 10,
            itemsAplicados: 1,
            detallePorItem: [{ productoId: 1, cantidad: 1, precioOriginal: 100, descuento: 10, precioFinal: 90 }],
          },
        })
      ),
    };
    const controller = new CuponController(prisma as never, cuponEngine as never);
    const req = {
      uid: 'uid-1',
      empresaId: 1,
      body: { codigo: 'DESC10', items: [{ productoWebId: 1, cantidad: 1, precioUnitario: 100 }] },
    } as unknown as FirebaseAuthRequest;
    const res = mockRes();
    await controller.validar(req, res, mockNext());
    assert.strictEqual(res._status, 200);
    const data = (res._body as { data: { aplicable: boolean; descuentoTotal: number } }).data;
    assert.strictEqual(data.aplicable, true);
    assert.strictEqual(data.descuentoTotal, 10);
  });
});
