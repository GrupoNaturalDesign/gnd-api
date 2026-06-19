import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isConsumerEmailDomain,
  skipConsumerEmailDomainCheck,
  validateConsumerEmail,
} from '../src/utils/email-domain.validation';

describe('email-domain.validation', () => {
  const prevAllow = process.env.ALLOW_ANY_EMAIL_DOMAIN;
  const prevIntegrations = process.env.INTEGRATIONS_ENV;

  afterEach(() => {
    if (prevAllow === undefined) delete process.env.ALLOW_ANY_EMAIL_DOMAIN;
    else process.env.ALLOW_ANY_EMAIL_DOMAIN = prevAllow;
    if (prevIntegrations === undefined) delete process.env.INTEGRATIONS_ENV;
    else process.env.INTEGRATIONS_ENV = prevIntegrations;
  });

  it('acepta dominios de proveedores habituales', () => {
    assert.equal(isConsumerEmailDomain('user@gmail.com'), true);
    assert.equal(isConsumerEmailDomain('User@OUTLOOK.COM'), true);
    assert.equal(isConsumerEmailDomain('x@yahoo.com.ar'), true);
  });

  it('rechaza dominios no listados cuando no hay bypass', () => {
    delete process.env.ALLOW_ANY_EMAIL_DOMAIN;
    assert.equal(isConsumerEmailDomain('qa@empresa.com'), false);
    assert.equal(
      validateConsumerEmail('qa@empresa.com', { skipDomainCheck: false }),
      'Usá un email de un proveedor habitual (Gmail, Outlook, Yahoo, iCloud, etc.).'
    );
  });

  it('permite cualquier dominio con formato válido si ALLOW_ANY_EMAIL_DOMAIN=true en test', () => {
    delete process.env.INTEGRATIONS_ENV;
    process.env.ALLOW_ANY_EMAIL_DOMAIN = 'true';
    assert.equal(skipConsumerEmailDomainCheck(), true);
    assert.equal(validateConsumerEmail('test@example.com', { skipDomainCheck: true }), undefined);
  });

  it('no bypass en production aunque ALLOW_ANY_EMAIL_DOMAIN=true', () => {
    process.env.INTEGRATIONS_ENV = 'production';
    process.env.ALLOW_ANY_EMAIL_DOMAIN = 'true';
    assert.equal(skipConsumerEmailDomainCheck(), false);
    assert.equal(
      validateConsumerEmail('test@example.com', { skipDomainCheck: skipConsumerEmailDomainCheck() }),
      'Usá un email de un proveedor habitual (Gmail, Outlook, Yahoo, iCloud, etc.).'
    );
  });
});
