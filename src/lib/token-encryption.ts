/**
 * Cifrado de secretos en reposo (AES-256-GCM).
 * Usado para sfactoryToken y claves MiCorreo en BD.
 *
 * Claves (32 bytes base64):
 * - INTEGRATIONS_SECRETS_ENCRYPTION_KEY (preferida para integraciones)
 * - SFACTORY_TOKEN_ENCRYPTION_KEY (legacy S-Factory; fallback)
 *
 * Generar: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function parseKeyFromEnv(raw: string | undefined): Buffer | null {
  if (!raw || raw.length < 32) return null;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length === KEY_LENGTH ? key : null;
  } catch {
    return null;
  }
}

function getIntegrationsKey(): Buffer | null {
  return parseKeyFromEnv(process.env.INTEGRATIONS_SECRETS_ENCRYPTION_KEY);
}

function getSfactoryKey(): Buffer | null {
  return parseKeyFromEnv(process.env.SFACTORY_TOKEN_ENCRYPTION_KEY);
}

/** Clave efectiva: integraciones primero, luego S-Factory. */
function getSecretKey(): Buffer | null {
  return getIntegrationsKey() ?? getSfactoryKey();
}

/** @deprecated use getSecretKey */
function getKey(): Buffer | null {
  return getSfactoryKey();
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptWithKey(encrypted: string, key: Buffer): string | null {
  if (!encrypted || typeof encrypted !== 'string') return null;
  const raw = encrypted.trim();
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch {
    return null;
  }
}

/**
 * Cifra un secreto. Si no hay clave configurada, devuelve texto plano (compatibilidad dev).
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getSecretKey();
  if (!key) return plaintext;
  return encryptWithKey(plaintext, key);
}

/**
 * Descifra un secreto guardado. Sin clave, devuelve el valor tal cual (legacy plaintext).
 */
export function decryptSecret(encrypted: string): string | null {
  if (!encrypted || typeof encrypted !== 'string') return null;
  const key = getSecretKey();
  if (!key) return encrypted;
  return decryptWithKey(encrypted, key);
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  return encryptWithKey(plaintext, key);
}

export function decryptToken(encrypted: string): string | null {
  if (!encrypted || typeof encrypted !== 'string') return null;
  const key = getKey();
  if (!key) return encrypted;
  return decryptWithKey(encrypted, key);
}

export function isEncryptionConfigured(): boolean {
  return getSecretKey() !== null;
}

export function isIntegrationsEncryptionConfigured(): boolean {
  return getIntegrationsKey() !== null;
}
