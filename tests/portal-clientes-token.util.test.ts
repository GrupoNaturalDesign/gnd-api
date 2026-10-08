import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import {
  construirLinkPortalClientes,
  firmarTokenPortalClientes,
} from '../src/utils/portal-clientes-token.util';

const SECRET = 'test-secret-de-al-menos-32-caracteres!!';
const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

function verificar(token: string) {
  return jwt.verify(token, SECRET, {
    algorithms: ['HS256'],
    issuer: 'naturalonline.com.ar',
    audience: 'clientes.naturalonline.com.ar',
    clockTimestamp: NOW_SEC,
  }) as jwt.JwtPayload;
}

describe('portal-clientes-token.util', () => {
  it('firma HS256 con los claims acordados y vence a los 180 s', () => {
    const token = firmarTokenPortalClientes(
      { dni: '34768467', cuit: '20347684678' },
      'usuario@empresa.com',
      SECRET,
      NOW
    );
    assert.equal(jwt.decode(token, { complete: true })?.header.alg, 'HS256');

    const payload = verificar(token);
    assert.equal(payload.dni, '34768467');
    assert.equal(payload.cuit, '20347684678');
    assert.equal(payload.email, 'usuario@empresa.com');
    assert.equal(payload.iat, NOW_SEC);
    assert.equal(payload.exp, NOW_SEC + 180);
    assert.match(String(payload.jti), /^[0-9a-f-]{36}$/);
  });

  it('empresa: no incluye dni', () => {
    const payload = verificar(
      firmarTokenPortalClientes({ cuit: '30712345678' }, 'a@b.com', SECRET, NOW)
    );
    assert.equal(payload.cuit, '30712345678');
    assert.equal('dni' in payload, false);
  });

  it('jti distinto en cada token', () => {
    const a = verificar(firmarTokenPortalClientes({ dni: '1234567' }, 'a@b.com', SECRET, NOW));
    const b = verificar(firmarTokenPortalClientes({ dni: '1234567' }, 'a@b.com', SECRET, NOW));
    assert.notEqual(a.jti, b.jti);
  });

  it('rechaza el token vencido o firmado con otro secreto', () => {
    const token = firmarTokenPortalClientes({ dni: '1234567' }, 'a@b.com', SECRET, NOW);
    assert.throws(
      () => jwt.verify(token, SECRET, { clockTimestamp: NOW_SEC + 181 }),
      /jwt expired/
    );
    assert.throws(() => jwt.verify(token, 'otro-secreto-de-al-menos-32-caracteres'), /invalid signature/);
  });

  it('arma la URL de login con el token como query param', () => {
    const link = construirLinkPortalClientes(
      { dni: '34768467' },
      'a@b.com',
      { secret: SECRET, loginUrl: 'https://clientes.naturalonline.com.ar/ssfi/login' },
      NOW
    );
    const url = new URL(link.url);
    assert.equal(url.origin + url.pathname, 'https://clientes.naturalonline.com.ar/ssfi/login');
    assert.equal(verificar(url.searchParams.get('token') ?? '').dni, '34768467');
    assert.equal(link.expiresAt, '2026-10-03T12:03:00.000Z');
  });
});
