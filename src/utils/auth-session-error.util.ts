import { CONSUMER_EMAIL_DOMAIN_ERROR } from './email-domain.core';

const CLIENT_ERROR_MESSAGES = new Set([
  CONSUMER_EMAIL_DOMAIN_ERROR,
  'El email es requerido',
  'Email inválido',
  'Usuario sin email no soportado.',
]);

function isInfrastructureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('pool timeout') ||
    lower.includes('prisma') ||
    lower.includes('database') ||
    lower.includes('sql')
  );
}

function isFirebaseTokenMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('id token') ||
    lower.includes('firebase') ||
    (lower.includes('token') &&
      (lower.includes('expired') || lower.includes('revoked') || lower.includes('invalid')))
  );
}

/** Mapea errores de getOrCreateSession a status HTTP y mensaje para el cliente. */
export function resolveAuthSessionError(message: string): {
  status: number;
  clientMessage: string;
  logMessage?: string;
} {
  if (CLIENT_ERROR_MESSAGES.has(message)) {
    return { status: 400, clientMessage: message };
  }

  if (message.includes('desactivado')) {
    return { status: 403, clientMessage: message };
  }

  if (message.includes('Rol') && message.includes('no existe')) {
    return { status: 503, clientMessage: message };
  }

  if (
    message.includes('Unique constraint') &&
    message.toLowerCase().includes('email')
  ) {
    return {
      status: 409,
      clientMessage:
        'Este email ya está registrado. Intentá iniciar sesión o contactá soporte si el problema persiste.',
      logMessage: message,
    };
  }

  if (isInfrastructureMessage(message)) {
    return {
      status: 503,
      clientMessage: 'Servicio de sesión temporalmente no disponible.',
      logMessage: message,
    };
  }

  if (isFirebaseTokenMessage(message)) {
    return { status: 401, clientMessage: message };
  }

  return { status: 500, clientMessage: message, logMessage: message };
}
