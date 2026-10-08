import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PORTAL_CLIENTES_JWT, type PortalClientesConfig } from '../config/portal-clientes.config';
import type { IdentidadPortal } from './portal-identidad.util';

export interface PortalClientesSsoLink {
  url: string;
  expiresAt: string;
}

export function firmarTokenPortalClientes(
  identidad: IdentidadPortal,
  email: string,
  secret: string,
  now: Date = new Date()
): string {
  const payload: Record<string, string | number> = {
    email,
    iat: Math.floor(now.getTime() / 1000),
  };
  if (identidad.dni) payload.dni = identidad.dni;
  if (identidad.cuit) payload.cuit = identidad.cuit;

  return jwt.sign(payload, secret, {
    algorithm: PORTAL_CLIENTES_JWT.alg,
    expiresIn: PORTAL_CLIENTES_JWT.expiresInSeconds,
    issuer: PORTAL_CLIENTES_JWT.issuer,
    audience: PORTAL_CLIENTES_JWT.audience,
    jwtid: randomUUID(),
  });
}

export function construirLinkPortalClientes(
  identidad: IdentidadPortal,
  email: string,
  config: PortalClientesConfig,
  now: Date = new Date()
): PortalClientesSsoLink {
  const token = firmarTokenPortalClientes(identidad, email, config.secret, now);
  const url = new URL(config.loginUrl);
  url.searchParams.set('token', token);
  const expiresAt = new Date(now.getTime() + PORTAL_CLIENTES_JWT.expiresInSeconds * 1000);
  return { url: url.toString(), expiresAt: expiresAt.toISOString() };
}
