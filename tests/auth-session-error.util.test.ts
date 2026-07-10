import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONSUMER_EMAIL_DOMAIN_ERROR } from '../src/utils/email-domain.core';
import { resolveAuthSessionError } from '../src/utils/auth-session-error.util';

describe('auth-session-error.util', () => {
  it('dominio de email no permitido → 400 con mensaje explícito', () => {
    const result = resolveAuthSessionError(CONSUMER_EMAIL_DOMAIN_ERROR);
    assert.equal(result.status, 400);
    assert.equal(result.clientMessage, CONSUMER_EMAIL_DOMAIN_ERROR);
    assert.equal(result.logMessage, undefined);
  });

  it('usuario desactivado → 403', () => {
    const msg = 'Usuario desactivado. Contacte al administrador.';
    const result = resolveAuthSessionError(msg);
    assert.equal(result.status, 403);
    assert.equal(result.clientMessage, msg);
  });

  it('email duplicado en DB → 409 con mensaje claro', () => {
    const msg =
      'Unique constraint failed on the constraint: `email`';
    const result = resolveAuthSessionError(msg);
    assert.equal(result.status, 409);
    assert.match(result.clientMessage, /ya está registrado/i);
    assert.ok(result.logMessage?.includes('Unique constraint'));
  });

  it('error Prisma → 503 genérico y log', () => {
    const result = resolveAuthSessionError('PrismaClientKnownRequestError: Unique constraint');
    assert.equal(result.status, 503);
    assert.equal(result.clientMessage, 'Servicio de sesión temporalmente no disponible.');
    assert.ok(result.logMessage?.includes('Prisma'));
  });

  it('token Firebase inválido → 401', () => {
    const msg = 'Firebase ID token has invalid signature.';
    const result = resolveAuthSessionError(msg);
    assert.equal(result.status, 401);
    assert.equal(result.clientMessage, msg);
  });

  it('error desconocido → 500 con mensaje real', () => {
    const msg = 'Algo inesperado en el servicio.';
    const result = resolveAuthSessionError(msg);
    assert.equal(result.status, 500);
    assert.equal(result.clientMessage, msg);
    assert.equal(result.logMessage, msg);
  });
});
