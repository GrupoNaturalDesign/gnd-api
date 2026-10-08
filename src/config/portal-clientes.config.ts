const DEFAULT_BASE_URL = 'https://clientes.naturalonline.com.ar';
const LOGIN_PATH = '/ssfi/login';
/** HS256 con secretos cortos es vulnerable a fuerza bruta. */
const MIN_SECRET_LENGTH = 32;

export const PORTAL_CLIENTES_JWT = {
  alg: 'HS256',
  issuer: 'naturalonline.com.ar',
  audience: 'clientes.naturalonline.com.ar',
  expiresInSeconds: 180,
} as const;

export interface PortalClientesConfig {
  secret: string;
  loginUrl: string;
}

export function getPortalClientesBaseUrl(): string {
  const raw = process.env.PORTAL_CLIENTES_URL?.trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function isPortalClientesConfigured(): boolean {
  const secret = process.env.PORTAL_CLIENTES_JWT_SECRET?.trim();
  return !!secret && secret.length >= MIN_SECRET_LENGTH;
}

export function getPortalClientesConfig(): PortalClientesConfig {
  const secret = process.env.PORTAL_CLIENTES_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('Portal Clientes: falta PORTAL_CLIENTES_JWT_SECRET en .env');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Portal Clientes: PORTAL_CLIENTES_JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres`
    );
  }
  return {
    secret,
    loginUrl: `${getPortalClientesBaseUrl()}${LOGIN_PATH}`,
  };
}
