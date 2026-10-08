import { digitsOnly } from './string-coerce.util';

export interface IdentidadPortal {
  dni?: string;
  cuit?: string;
}

const PREFIJOS_PERSONA_FISICA = new Set(['20', '23', '24', '27']);
const PREFIJOS_PERSONA_JURIDICA = new Set(['30', '33', '34']);

/** DNI sin ceros de relleno: "06123456" → "6123456". Ver api/docs/portal-clientes.md (Decisiones). */
function normalizarDni(digits: string): string | null {
  const sinCeros = digits.replace(/^0+/, '');
  return sinCeros.length >= 6 && sinCeros.length <= 8 ? sinCeros : null;
}

/**
 * CUIT/CUIL/DNI (tax_id de SFactory o `clientes.cuit`) → claims `dni` / `cuit` del JWT del portal.
 * Persona física: DNI = 8 dígitos centrales del CUIL. Empresa: solo CUIT.
 */
export function resolverIdentidadPortal(taxIdRaw: unknown): IdentidadPortal | null {
  const digits = digitsOnly(taxIdRaw);

  if (digits.length === 11) {
    const prefijo = digits.slice(0, 2);
    if (PREFIJOS_PERSONA_FISICA.has(prefijo)) {
      const dni = normalizarDni(digits.slice(2, 10));
      return dni ? { dni, cuit: digits } : { cuit: digits };
    }
    if (PREFIJOS_PERSONA_JURIDICA.has(prefijo)) {
      return { cuit: digits };
    }
    return null;
  }

  if (digits.length >= 7 && digits.length <= 8) {
    const dni = normalizarDni(digits);
    return dni ? { dni } : null;
  }

  return null;
}

/**
 * Varios clientes candidatos (ej. mismo email en SFactory): solo se usa la identidad si todos
 * resuelven a la misma. Si difieren, no se elige una al azar porque el portal da acceso por DNI.
 */
export function resolverIdentidadUnica(taxIds: unknown[]): IdentidadPortal | null {
  const identidades = taxIds
    .map(resolverIdentidadPortal)
    .filter((i): i is IdentidadPortal => i != null);
  const [primera] = identidades;
  if (!primera) return null;

  const claves = new Set(identidades.map((i) => `${i.dni ?? ''}|${i.cuit ?? ''}`));
  return claves.size === 1 ? primera : null;
}
