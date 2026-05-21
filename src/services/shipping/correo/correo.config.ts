/**
 * MiCorreo API — URLs y constantes (única fuente de base URL por entorno).
 */

export type CorreoEnv = 'test' | 'prod';

const MICORREO_BASE: Record<CorreoEnv, string> = {
  test: 'https://apitest.correoargentino.com.ar/micorreo/v1',
  prod: 'https://api.correoargentino.com.ar/micorreo/v1',
};

export const CORREO_PATHS = {
  token: '/token',
  usersValidate: '/users/validate',
  rates: '/rates',
  shippingImport: '/shipping/import',
  shippingTracking: '/shipping/tracking',
  agencies: '/agencies',
} as const;

/** Entorno global (rutas de prueba, herramientas). Si `CORREO_ENV` no está, usa `CORREO_DEFAULT_ENV`. */
export function resolveCorreoEnv(): CorreoEnv {
  const explicit = process.env.CORREO_ENV?.trim().toLowerCase();
  if (explicit === 'prod' || explicit === 'production') return 'prod';
  if (
    explicit === 'test' ||
    explicit === 'sandbox' ||
    explicit === 'qa' ||
    explicit === 'apitest'
  ) {
    return 'test';
  }
  return process.env.CORREO_DEFAULT_ENV === 'prod' ? 'prod' : 'test';
}

/** Desde `EmpresaEnvioConfig.correoEnv`. */
export function mapEmpresaCorreoEnv(raw: string): CorreoEnv {
  return raw === 'prod' ? 'prod' : 'test';
}

export function getCorreoBaseUrlForEnv(env: CorreoEnv): string {
  return MICORREO_BASE[env];
}

export function getCorreoBaseUrl(): string {
  return getCorreoBaseUrlForEnv(resolveCorreoEnv());
}

function firstNonEmptyCorreo(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return '';
}

/**
 * Usuario/clave MiCorreo según entorno (apitest vs api).
 * `CORREO_*_QA` / `CORREO_*_PROD` o fallback a `CORREO_USERNAME` / `CORREO_PASSWORD`.
 */
export function loadCorreoCredentials(env: CorreoEnv): {
  username: string;
  password: string;
} {
  const isProd = env === 'prod';
  const username = isProd
    ? firstNonEmptyCorreo(
        process.env.CORREO_USERNAME_PROD,
        process.env.CORREO_USERNAME
      )
    : firstNonEmptyCorreo(
        process.env.CORREO_USERNAME_QA,
        process.env.CORREO_USERNAME_TEST,
        process.env.CORREO_USERNAME
      );
  const password = isProd
    ? firstNonEmptyCorreo(
        process.env.CORREO_PASSWORD_PROD,
        process.env.CORREO_PASSWORD
      )
    : firstNonEmptyCorreo(
        process.env.CORREO_PASSWORD_QA,
        process.env.CORREO_PASSWORD_TEST,
        process.env.CORREO_PASSWORD
      );
  if (!username || !password) {
    throw new Error(
      'Configure MiCorreo: CORREO_USERNAME_QA/CORREO_PASSWORD_QA o CORREO_USERNAME_PROD/CORREO_PASSWORD_PROD, o CORREO_USERNAME/CORREO_PASSWORD'
    );
  }
  return { username, password };
}

/**
 * Email para POST /users/validate (MiCorreo exige el mail del portal; el usuario API suele no ser email).
 * Prioridad: CORREO_EMAIL_QA / CORREO_EMAIL_PROD → CORREO_EMAIL → username si contiene @.
 */
export function loadCorreoValidateEmail(env: CorreoEnv): string {
  const isProd = env === 'prod';
  const explicit = isProd
    ? firstNonEmptyCorreo(process.env.CORREO_EMAIL_PROD, process.env.CORREO_EMAIL)
    : firstNonEmptyCorreo(process.env.CORREO_EMAIL_QA, process.env.CORREO_EMAIL);
  if (explicit) return explicit;
  const { username } = loadCorreoCredentials(env);
  if (username.includes('@')) return username;
  return username;
}

/** Omite /users/validate (dev o customerId ya conocido). */
export function getCorreoCustomerIdOverride(): string | undefined {
  const v = process.env.CORREO_CUSTOMER_ID?.trim();
  return v || undefined;
}

export function getCorreoTimeoutMs(): number {
  const raw = process.env.CORREO_TIMEOUT_MS;
  if (raw == null || raw === '') return 30_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 30_000;
}

export function isCorreoMock(): boolean {
  const v = process.env.CORREO_MOCK?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
