import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma';
import { generarLinkPortalClientes } from '../src/services/portal-clientes.service';
import { documentoPortalSchema, decisionPortalSchema } from '../src/validation/portal-identidad.schema';
import { solicitar, decidir } from '../src/controllers/portal-identidad.controller';
import { FirebaseAuthRequest } from '../src/middleware/firebase-auth.middleware';
import { Response } from 'express';

function respuesta() {
  const result = { statusCode: 200, body: null as unknown, status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; } };
  return result;
}

const restores: Array<() => void> = [];
function stub(target: object, key: string, implementation: (...args: unknown[]) => unknown) {
  const obj = target as Record<string, unknown>;
  const previous = obj[key];
  obj[key] = implementation;
  restores.push(() => { obj[key] = previous; });
}
const SECRET = 'prueba-vinculacion-secreto-largo-32-caracteres';
let originalSecret: string | undefined;
describe('vinculación de identidad para el portal', () => {
  beforeEach(() => {
    originalSecret = process.env.PORTAL_CLIENTES_JWT_SECRET;
    process.env.PORTAL_CLIENTES_JWT_SECRET = SECRET;
    stub(prisma.usuario, 'findFirst', async () => ({ id: 1, email: 'test@example.com', emailVerified: true,
      activo: true, sfactoryClienteId: null, cliente: { cuit: '20417119460' } }));
  });
  afterEach(() => {
    while (restores.length) restores.pop()!();
    if (originalSecret === undefined) delete process.env.PORTAL_CLIENTES_JWT_SECRET;
    else process.env.PORTAL_CLIENTES_JWT_SECRET = originalSecret;
  });
  it('una solicitud pendiente no permite firmar aunque haya otra fuente de identidad', async () => {
    stub(prisma.portalIdentidad, 'findUnique', async () => ({ estado: 'pendiente', dniVerificado: null }));
    await assert.rejects(generarLinkPortalClientes('uid-test'), { code: 'IDENTIFICACION_REQUERIDA' });
  });
  it('una identidad revocada bloquea el acceso', async () => {
    stub(prisma.portalIdentidad, 'findUnique', async () => ({ estado: 'rechazado', dniVerificado: null }));
    await assert.rejects(generarLinkPortalClientes('uid-test'), { code: 'IDENTIFICACION_REQUERIDA' });
  });
  it('una identidad aprobada usa el DNI verificado y el contrato SSFI', async () => {
    stub(prisma.portalIdentidad, 'findUnique', async () => ({ estado: 'aprobado', dniVerificado: '41711946' }));
    const link = await generarLinkPortalClientes('uid-test');
    const url = new URL(link.url);
    assert.equal(url.pathname, '/ssfi/portal');
    const payload = jwt.verify(url.searchParams.get('token')!, SECRET, { algorithms: ['HS256'], audience: 'SSFI-PORTAL' }) as jwt.JwtPayload;
    assert.equal(payload.dni, '41711946');
  });
  it('sin solicitud conserva el acceso existente por cliente vinculado', async () => {
    stub(prisma.portalIdentidad, 'findUnique', async () => null);
    await assert.doesNotReject(generarLinkPortalClientes('uid-test'));
  });
  it('acepta DNI/CUIL de persona y rechaza empresas, letras o documento vacío', () => {
    assert.equal(documentoPortalSchema.parse('41.711.946'), '41711946');
    assert.equal(documentoPortalSchema.parse('20-41711946-0'), '41711946');
    for (const value of ['', '30-71234567-8', 'dni41711946']) assert.equal(documentoPortalSchema.safeParse(value).success, false);
  });
  it('no permite aprobar sin confirmación explícita o motivo de verificación', () => {
    const data = { email: 'test@example.com', documento: '41711946', aprobar: true, motivo: 'Confirmado por RRHH' };
    assert.equal(decisionPortalSchema.safeParse(data).success, false);
    assert.equal(decisionPortalSchema.safeParse({ ...data, identidadComprobada: true }).success, true);
  });
  it('rechaza solicitudes de una cuenta sin email verificado', async () => {
    stub(prisma.usuario, 'findFirst', async () => ({ id: 1, activo: true, emailVerified: false }));
    const req = { uid: 'uid-test', body: { documento: '41711946' } } as FirebaseAuthRequest;
    const res = respuesta();
    await solicitar(req, res as unknown as Response, (e) => { throw e; });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(req.body, {});
  });
  it('el formulario público nunca reemplaza una aprobación existente', async () => {
    stub(prisma, '$transaction', async (callback) => (callback as Function)({ portalIdentidad: {
      upsert: async (input: { update: unknown }) => assert.deepEqual(input.update, {}),
      updateMany: async (input: { where: { estado: unknown } }) => assert.deepEqual(input.where.estado, { not: 'aprobado' }),
      findUniqueOrThrow: async () => ({ estado: 'aprobado' }),
    } }));
    const req = { uid: 'uid-test', body: { documento: '12345678' } } as FirebaseAuthRequest;
    const res = respuesta();
    await solicitar(req, res as unknown as Response, (e) => { throw e; });
    assert.deepEqual(res.body, { success: true, data: { estado: 'aprobado' } });
  });
  it('un administrador no puede vincular una cuenta fuera de su tienda', async () => {
    let calls = 0;
    stub(prisma.usuario, 'findFirst', async (query) => {
      if (++calls === 1) return { id: 7, activo: true };
      assert.deepEqual((query as { where: { OR: unknown } }).where.OR, [{ empresaId: 1 }, { empresaId: null }]);
      return null;
    });
    const req = { uid: 'admin-test', empresaId: 1, body: { email: 'test@example.com', documento: '41711946',
      aprobar: true, motivo: 'Confirmado por RRHH', identidadComprobada: true } } as FirebaseAuthRequest;
    const res = respuesta();
    await decidir(req, res as unknown as Response, (e) => { throw e; });
    assert.equal(res.statusCode, 404);
  });
});
