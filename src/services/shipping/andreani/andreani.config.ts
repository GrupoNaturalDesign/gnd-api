/**
 * Configuración Andreani: URLs, paths y credenciales desde env.
 * Entorno efectivo: `INTEGRATIONS_ENV` (ver `api/docs/integrations-env.md`).
 * Paths por defecto: login `/login`, cotización GET `/v1/tarifas`, órdenes `/v2/ordenes-de-envio` (ajustar con ANDREANI_PATH_*).
 */

import { getIntegrationsMode } from '../../../lib/integrations-mode';

export type AndreaniEnv = 'test' | 'prod';

export function resolveAndreaniEnv(): AndreaniEnv {
  return getIntegrationsMode();
}

/** Alias de `resolveAndreaniEnv` (legacy / observabilidad BD). */
export function mapEmpresaEnvioToAndreaniEnv(_raw: string): AndreaniEnv {
  return resolveAndreaniEnv();
}

export function getAndreaniBaseUrl(env: AndreaniEnv): string {
  const override = process.env.ANDREANI_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  return env === 'prod' ? 'https://apis.andreani.com' : 'https://apisqa.andreani.com';
}

export interface AndreaniCredentials {
  username: string;
  password: string;
}

/**
 * Credenciales según `INTEGRATIONS_ENV` (test → QA, production → PROD).
 * Prioridad: `ANDREANI_*_QA` / `ANDREANI_*_PROD`, luego `ANDREANI_USERNAME` / `ANDREANI_PASSWORD`.
 */
export function loadAndreaniCredentials(env: AndreaniEnv): AndreaniCredentials {
  const isProd = env === 'prod';
  const username = isProd
    ? firstNonEmpty(
        process.env.ANDREANI_USERNAME_PROD,
        process.env.ANDREANI_USERNAME,
        process.env.USER_ANDREANI
      )
    : firstNonEmpty(
        process.env.ANDREANI_USERNAME_QA,
        process.env.ANDREANI_USERNAME_TEST,
        process.env.ANDREANI_USERNAME,
        process.env.USER_ANDREANI
      );
  const password = isProd
    ? firstNonEmpty(
        process.env.ANDREANI_PASSWORD_PROD,
        process.env.ANDREANI_PASSWORD,
        process.env.PASS_ANDREANI
      )
    : firstNonEmpty(
        process.env.ANDREANI_PASSWORD_QA,
        process.env.ANDREANI_PASSWORD_TEST,
        process.env.ANDREANI_PASSWORD,
        process.env.PASS_ANDREANI
      );
  return { username, password };
}

function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return '';
}

export interface AndreaniPaths {
  login: string;
  cotizar: string;
  ordenesEnvio: string;
  envios: string;
}

export function getAndreaniPaths(): AndreaniPaths {
  return {
    login: process.env.ANDREANI_PATH_LOGIN?.trim() || '/login',
    cotizar: process.env.ANDREANI_PATH_COTIZAR?.trim() || '/v1/tarifas',
    ordenesEnvio:
      process.env.ANDREANI_PATH_ORDENES_ENVIO?.trim() || '/v2/ordenes-de-envio',
    envios: process.env.ANDREANI_PATH_ENVIOS?.trim() || '/v2/envios',
  };
}

export function isAndreaniMock(): boolean {
  const v = process.env.ANDREANI_MOCK?.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function getAndreaniClienteCode(): string {
  return process.env.ANDREANI_CLIENTE?.trim() || '';
}

export function getAndreaniContratoDomicilio(): string {
  return firstNonEmpty(
    process.env.ANDREANI_CONTRATO_ENTREGA_DOMICILIO,
    process.env.ANDREANI_CONTRATO_DOM
  );
}

export function getAndreaniContratoSucursal(): string {
  return firstNonEmpty(
    process.env.ANDREANI_CONTRATO_ENTREGA_SUCURSAL,
    process.env.ANDREANI_CONTRATO_SUC
  );
}

export function getAndreaniSucursalOrigen(): string {
  return process.env.ANDREANI_SUCURSAL_ORIGEN?.trim() || '';
}

export function getAndreaniOrigenCp(): string {
  return process.env.ANDREANI_ORIGEN_CP?.trim() || '5000';
}

/** Tipo de servicio en alta de orden (API v2): ej. `B2C`. */
export function getAndreaniTipoDeServicio(): string {
  return (
    process.env.ANDREANI_TIPO_SERVICIO?.trim() ||
    process.env.ANDREANI_TIPO_DE_SERVICIO?.trim() ||
    'B2C'
  );
}

/** Campo `sucursalClienteID` del JSON de orden; default 0 si no aplica. */
export function getAndreaniSucursalClienteId(): number {
  const n = parseInt(process.env.ANDREANI_SUCURSAL_CLIENTE_ID || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

/** Origen postal completo para órdenes (depósito / remitente físico). */
export function loadAndreaniOrigenPostal(): {
  codigoPostal: string;
  calle: string;
  numero: string;
  localidad: string;
  region: string;
  pais: string;
  piso: string;
  departamento: string;
  casillaDeCorreo: string;
  componentesDeDireccion: unknown[];
} {
  return {
    codigoPostal: getAndreaniOrigenCp(),
    calle: process.env.ANDREANI_ORIGEN_CALLE?.trim() || 'Depósito',
    numero: process.env.ANDREANI_ORIGEN_NUMERO?.trim() || '1',
    localidad: process.env.ANDREANI_ORIGEN_LOCALIDAD?.trim() || 'Córdoba',
    region: process.env.ANDREANI_ORIGEN_REGION?.trim() || 'Córdoba',
    pais: process.env.ANDREANI_ORIGEN_PAIS?.trim() || 'Argentina',
    piso: process.env.ANDREANI_ORIGEN_PISO?.trim() || '',
    departamento: process.env.ANDREANI_ORIGEN_DEPTO?.trim() || '',
    casillaDeCorreo: '',
    componentesDeDireccion: [],
  };
}

/** Remitente del JSON de orden (datos del comercio). */
export function loadAndreaniRemitente(): {
  nombreCompleto: string;
  eMail: string;
  telefonos: Array<{ tipo: number; numero: string }>;
  documentoTipo: string;
  documentoNumero: string;
} {
  let tel =
    process.env.ANDREANI_REMITENTE_TELEFONO?.trim() ||
    process.env.ANDREANI_ORIGEN_TELEFONO?.trim() ||
    '3510000000';
  tel = tel.replace(/\D/g, '') || '3510000000';
  return {
    nombreCompleto:
      process.env.ANDREANI_REMITENTE_NOMBRE?.trim() || 'Comercio',
    eMail:
      process.env.ANDREANI_REMITENTE_EMAIL?.trim() ||
      process.env.ANDREANI_REMITENTE_E_MAIL?.trim() ||
      'envio@ejemplo.invalid',
    telefonos: [{ tipo: 1, numero: tel }],
    documentoTipo: process.env.ANDREANI_REMITENTE_DOC_TIPO?.trim() || 'DNI',
    documentoNumero: process.env.ANDREANI_REMITENTE_DOC_NUM?.trim() || '',
  };
}

export function getAndreaniTokenHeaderName(): string {
  return process.env.ANDREANI_TOKEN_HEADER?.trim() || 'x-authorization-token';
}

export function getAndreaniRequestTimeoutMs(): number {
  const n = parseInt(process.env.ANDREANI_TIMEOUT_MS || '45000', 10);
  return Number.isFinite(n) && n > 0 ? n : 45000;
}
