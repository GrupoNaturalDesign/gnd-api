import { asTrimmedString, digitsOnly } from './string-coerce.util';

/** Shape unificado para el admin al crear pedido / buscar clientes. */
export interface ClienteBusquedaItem {
  id?: number;
  sfactoryId?: number | null;
  sfactoryCodigo?: string | null;
  razonSocial?: string | null;
  nombre?: string | null;
  cuit?: string | null;
  email?: string | null;
  telefono?: string | null;
  movil?: string | null;
  tipo?: string | null;
  activo?: boolean;
}

/**
 * Normaliza un cliente de SFactory (tax_id/legal_name/…) o de Prisma local
 * a un shape estable con strings (cuit nunca number).
 */
export function normalizeClienteBusquedaItem(raw: unknown): ClienteBusquedaItem {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);

  const id = typeof r.id === 'number' && Number.isFinite(r.id) ? r.id : undefined;
  const sfactoryIdFromLocal =
    typeof r.sfactoryId === 'number' && Number.isFinite(r.sfactoryId) ? r.sfactoryId : null;
  const looksLikeSfactory =
    r.legal_name != null || r.tax_id != null || (r.code != null && r.razonSocial == null);

  const emailRaw = asTrimmedString(r.email);
  const email = emailRaw && emailRaw !== '-' ? emailRaw : null;

  const cuitDigits = digitsOnly(r.cuit ?? r.tax_id);
  const cuit = cuitDigits.length > 0 ? cuitDigits : null;

  return {
    id,
    sfactoryId: looksLikeSfactory ? (id ?? sfactoryIdFromLocal) : sfactoryIdFromLocal,
    sfactoryCodigo: asTrimmedString(r.sfactoryCodigo ?? r.code),
    razonSocial: asTrimmedString(r.razonSocial ?? r.legal_name),
    nombre: asTrimmedString(r.nombre ?? r.name),
    cuit,
    email,
    telefono: asTrimmedString(r.telefono ?? r.phones),
    movil: asTrimmedString(r.movil ?? r.mobile),
    tipo: asTrimmedString(r.tipo ?? r.type),
    activo:
      r.activo === true ||
      r.active === 1 ||
      r.active === true ||
      (r.activo !== false && r.active !== 0 && r.active !== false),
  };
}

export function normalizeClienteBusquedaList(raw: unknown[]): ClienteBusquedaItem[] {
  return raw.map(normalizeClienteBusquedaItem);
}
