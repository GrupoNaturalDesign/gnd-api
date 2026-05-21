/**
 * Dominios de correo de proveedores habituales (Gmail, Outlook, Yahoo, etc.).
 * Mantener en sync con `client/src/lib/email-domain.core.ts`.
 */
export const CONSUMER_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.com.ar',
  'hotmail.com',
  'hotmail.com.ar',
  'live.com',
  'live.com.ar',
  'msn.com',
  'yahoo.com',
  'yahoo.com.ar',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'zoho.com',
  'mail.com',
] as const;

const CONSUMER_DOMAIN_SET = new Set<string>(CONSUMER_EMAIL_DOMAINS);

export const CONSUMER_EMAIL_DOMAIN_ERROR =
  'Usá un email de un proveedor habitual (Gmail, Outlook, Yahoo, iCloud, etc.).';

const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_REGEX.test(email.trim());
}

export function isConsumerEmailDomain(email: string): boolean {
  const domain = extractEmailDomain(email);
  return domain != null && CONSUMER_DOMAIN_SET.has(domain);
}

/**
 * @returns mensaje de error o `undefined` si el email es válido
 */
export function validateConsumerEmail(
  email: string,
  options?: { skipDomainCheck?: boolean }
): string | undefined {
  const trimmed = email.trim();
  if (!trimmed) return 'El email es requerido';
  if (!isValidEmailFormat(trimmed)) return 'Email inválido';
  if (options?.skipDomainCheck) return undefined;
  if (!isConsumerEmailDomain(trimmed)) return CONSUMER_EMAIL_DOMAIN_ERROR;
  return undefined;
}
