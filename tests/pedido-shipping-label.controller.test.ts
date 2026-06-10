import { describe, it } from 'node:test';
import assert from 'node:assert';
import { pedidoAdminController } from '../src/controllers/pedido-admin.controller';

function makeMockResponse() {
  let _statusCode = 200;
  let _jsonData: unknown;
  return {
    get statusCode() {
      return _statusCode;
    },
    get jsonData() {
      return _jsonData;
    },
    status(code: number) {
      _statusCode = code;
      return this;
    },
    json(data: unknown) {
      _jsonData = data;
    },
    setHeader(_name: string, _value: string) {},
    send(_data: unknown) {},
  };
}

function makeMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: 1,
    body: {},
    params: { id: '1' },
    query: {},
    ...overrides,
  };
}

describe('PedidoAdminController — etiqueta', () => {
  it('descargarEtiqueta 400 si pedidoId inválido', async () => {
    const res = makeMockResponse();
    const req = makeMockRequest({ params: { id: 'abc' } });
    await pedidoAdminController.descargarEtiqueta(req as never, res as never);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual((res.jsonData as { success: boolean }).success, false);
  });

  it('getEtiquetaDisponibilidad 400 si pedidoId inválido', async () => {
    const res = makeMockResponse();
    const req = makeMockRequest({ params: { id: 'xyz' } });
    await pedidoAdminController.getEtiquetaDisponibilidad(req as never, res as never);
    assert.strictEqual(res.statusCode, 400);
  });
});
