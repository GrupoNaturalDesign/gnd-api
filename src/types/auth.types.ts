import type { Rol } from '@prisma/client';

/**
 * Cuerpo para registro con email/password.
 * empresaId es lógica de negocio: opcional; si el cliente lo envía se guarda.
 */
export interface RegisterBody {
  email: string;
  password: string;
  nombre: string;
  apellido?: string;
  telefono?: string;
  empresaId?: number;
}

/**
 * Respuesta de validación de credenciales (para Auth.js Credentials provider).
 * Incluye los campos que irán al JWT/sesión.
 */
export interface AuthUserPayload {
  id: number;
  email: string;
  nombre: string;
  apellido: string | null;
  role: string; // 'ADMIN' | 'USER'
  empresaId: number | null;
  isSystemUser: boolean;
  emailVerified: boolean;
}

/**
 * Cuerpo para solicitar recuperación de contraseña.
 */
export interface ForgotPasswordBody {
  email: string;
}

/**
 * Cuerpo para restablecer contraseña con token.
 */
export interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

/**
 * Parámetros para verificar email (token en query o body).
 */
export interface VerifyEmailBody {
  token: string;
}

/**
 * Mapeo de Rol (enum legacy) a código de rol para auth.
 */
export function rolToAuthRole(rol: Rol): 'ADMIN' | 'USER' {
  return rol === 'admin' ? 'ADMIN' : 'USER';
}
