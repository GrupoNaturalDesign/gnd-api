/**
 * Helpers para campos que SFactory / ERP a veces mandan como number
 * (cuit, tax_id, teléfonos, CP) y el resto del código trata como string.
 */

/** Convierte string|number|nullish a string trimmeado, o null si vacío. */
export function asTrimmedString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const s = String(value).trim();
    return s === '' ? null : s;
  }
  return null;
}

/** Solo dígitos; acepta number (ej. CUIT/tax_id desde SFactory). */
export function digitsOnly(value: unknown): string {
  const s = asTrimmedString(value);
  if (!s) return '';
  return s.replace(/\D/g, '');
}
