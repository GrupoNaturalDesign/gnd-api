/** Dirección estructurada de checkout (cliente / snapshot). */
export interface CheckoutStructuredAddress {
  streetName: string;
  streetNumber: string;
  city: string;
  state: string;
  zipCode: string;
  floor?: string;
  department?: string;
  barrio?: string;
  loteManzana?: string;
}

export interface ShippingAddressInput {
  calle?: string;
  numero?: string;
  localidad?: string;
  provincia?: string;
  codigo_postal?: string;
  piso?: string;
  depto?: string;
  barrio?: string;
  loteManzana?: string;
  /** Legacy: línea única si no hay calle/numero */
  direccion?: string;
}

export function formatClienteDireccionLine(addr: CheckoutStructuredAddress): string {
  const parts = [
    addr.streetName,
    addr.streetNumber !== 's/n' ? addr.streetNumber : null,
    addr.floor ? `Piso ${addr.floor}` : null,
    addr.department ? `Depto ${addr.department}` : null,
    addr.barrio ? `Barrio ${addr.barrio}` : null,
    addr.loteManzana ? `Lote/Mz ${addr.loteManzana}` : null,
    addr.city,
    addr.state,
    addr.zipCode ? `CP ${addr.zipCode}` : null,
  ].filter((x) => x != null && String(x).trim() !== '');
  return parts.join(', ');
}

export function buildCheckoutStructuredAddress(
  input: ShippingAddressInput,
  cpFallback?: string
): CheckoutStructuredAddress | null {
  const streetName = (input.calle ?? input.direccion ?? '').trim();
  const streetNumber = (input.numero ?? '').trim() || 's/n';
  const city = (input.localidad ?? '').trim();
  const state = (input.provincia ?? '').trim();
  const zipCode = (input.codigo_postal ?? cpFallback ?? '').trim();

  if (!streetName || !city || !state || !zipCode) return null;

  const addr: CheckoutStructuredAddress = {
    streetName,
    streetNumber,
    city,
    state,
    zipCode,
  };
  const floor = input.piso?.trim();
  const department = input.depto?.trim();
  const barrio = input.barrio?.trim();
  const loteManzana = input.loteManzana?.trim();
  if (floor) addr.floor = floor;
  if (department) addr.department = department;
  if (barrio) addr.barrio = barrio;
  if (loteManzana) addr.loteManzana = loteManzana;
  return addr;
}

export function buildClienteDireccionFromAddress(addr: CheckoutStructuredAddress): string {
  return formatClienteDireccionLine(addr);
}

/** Campos factura desde checkout web. */
export interface CheckoutFacturaInput {
  necesitaFactura?: boolean;
  facturaTipo?: 'A' | 'C' | null;
  facturaCuit?: string | null;
  facturaRazonSocial?: string | null;
}

export function normalizeFacturaFields(input: CheckoutFacturaInput): {
  necesitaFactura: boolean;
  facturaTipo: 'A' | 'C' | null;
  facturaCuit: string | null;
  facturaRazonSocial: string | null;
} {
  if (!input.necesitaFactura) {
    return {
      necesitaFactura: false,
      facturaTipo: null,
      facturaCuit: null,
      facturaRazonSocial: null,
    };
  }
  const tipo = input.facturaTipo === 'A' || input.facturaTipo === 'C' ? input.facturaTipo : null;
  return {
    necesitaFactura: true,
    facturaTipo: tipo,
    facturaCuit: input.facturaCuit?.trim() || null,
    facturaRazonSocial: input.facturaRazonSocial?.trim() || null,
  };
}
