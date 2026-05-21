import { z } from 'zod';
import {
  CONSUMER_EMAIL_DOMAIN_ERROR,
  isConsumerEmailDomain,
  skipConsumerEmailDomainCheck,
} from '../utils/email-domain.validation';

export interface ConsumerEmailSchemaOptions {
  requiredMessage?: string;
  invalidFormatMessage?: string;
  domainMessage?: string;
}

export function createConsumerEmailSchema(options: ConsumerEmailSchemaOptions = {}) {
  const {
    requiredMessage = 'El email es requerido',
    invalidFormatMessage = 'Email inválido',
    domainMessage = CONSUMER_EMAIL_DOMAIN_ERROR,
  } = options;

  return z
    .string()
    .min(1, requiredMessage)
    .email(invalidFormatMessage)
    .refine(
      (email) => skipConsumerEmailDomainCheck() || isConsumerEmailDomain(email),
      { message: domainMessage }
    );
}

export const consumerEmailSchema = createConsumerEmailSchema();
