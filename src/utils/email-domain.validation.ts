import {
  CONSUMER_EMAIL_DOMAIN_ERROR,
  CONSUMER_EMAIL_DOMAINS,
  extractEmailDomain,
  isConsumerEmailDomain,
  isValidEmailFormat,
  validateConsumerEmail,
} from './email-domain.core';

export {
  CONSUMER_EMAIL_DOMAIN_ERROR,
  CONSUMER_EMAIL_DOMAINS,
  extractEmailDomain,
  isConsumerEmailDomain,
  isValidEmailFormat,
  validateConsumerEmail,
};

export function skipConsumerEmailDomainCheck(): boolean {
  return process.env.ALLOW_ANY_EMAIL_DOMAIN === 'true';
}

/** Lanza si el email no cumple formato o dominio de proveedor (salvo bypass en test). */
export function assertConsumerEmailAllowed(email: string): void {
  const err = validateConsumerEmail(email, {
    skipDomainCheck: skipConsumerEmailDomainCheck(),
  });
  if (err) throw new Error(err);
}
