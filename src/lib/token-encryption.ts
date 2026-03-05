/**
 * Cifrado de tokens en reposo (AES-256-GCM).
 * Usado para sfactoryToken en BD: si la BD se filtra, los tokens no son útiles sin la clave.
 *
 * Variable de entorno: SFACTORY_TOKEN_ENCRYPTION_KEY
 * - Debe ser una cadena en base64 de exactamente 32 bytes (44 caracteres en base64).
 * - Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer | null {
  const raw = process.env.SFACTORY_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length === KEY_LENGTH ? key : null;
  } catch {
    return null;
  }
}

/**
 * Cifra un token en texto plano. Retorna una cadena base64(IV + authTag + ciphertext).
 * Si SFACTORY_TOKEN_ENCRYPTION_KEY no está configurada, devuelve el texto plano (compatibilidad).
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Descifra un token guardado. Si el valor no es base64 válido o el descifrado falla, retorna null.
 * Si la clave no está configurada, devuelve el valor tal cual (token en texto plano).
 */
export function decryptToken(encrypted: string): string | null {
  if (!encrypted || typeof encrypted !== 'string') return null;
  const key = getKey();
  if (!key) return encrypted;
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
 * Indica si el cifrado está configurado (clave presente y válida).
 */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}
