/**
 * Tipos MiCorreo y códigos de provincia (documentación oficial MiCorreo).
 */

export const CORREO_ARG_PROVINCE_CODES = {
  A: 'Salta',
  B: 'Provincia de Buenos Aires',
  C: 'CABA',
  D: 'San Luis',
  E: 'Entre Ríos',
  F: 'La Rioja',
  G: 'Santiago del Estero',
  H: 'Chaco',
  J: 'San Juan',
  K: 'Catamarca',
  L: 'La Pampa',
  M: 'Mendoza',
  N: 'Misiones',
  P: 'Formosa',
  Q: 'Neuquén',
  R: 'Río Negro',
  S: 'Santa Fe',
  T: 'Tucumán',
  U: 'Chubut',
  V: 'Tierra del Fuego',
  W: 'Corrientes',
  X: 'Córdoba',
  Y: 'Jujuy',
  Z: 'Santa Cruz',
} as const;

export type CorreoArgProvinceCode = keyof typeof CORREO_ARG_PROVINCE_CODES;

const NFKD = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '');

function normalizeProvinceKey(name: string): string {
  return NFKD(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mapa nombre normalizado → código de una letra. */
const NAME_TO_CODE: Map<string, CorreoArgProvinceCode> = new Map();
for (const [code, label] of Object.entries(CORREO_ARG_PROVINCE_CODES)) {
  NAME_TO_CODE.set(normalizeProvinceKey(label), code as CorreoArgProvinceCode);
}
NAME_TO_CODE.set(normalizeProvinceKey('Buenos Aires'), 'B');
NAME_TO_CODE.set(normalizeProvinceKey('Ciudad Autonoma de Buenos Aires'), 'C');
NAME_TO_CODE.set(normalizeProvinceKey('Ciudad Autónoma de Buenos Aires'), 'C');

/**
 * Resuelve el código de provincia (A–Z) a partir del nombre (case-insensitive, sin tildes).
 */
export function getProvinceCode(provinceName: string): string | undefined {
  const k = normalizeProvinceKey(provinceName);
  if (k.length === 1 && /^[a-z]$/i.test(k)) {
    const c = k.toUpperCase() as CorreoArgProvinceCode;
    if (c in CORREO_ARG_PROVINCE_CODES) return c;
  }
  return NAME_TO_CODE.get(k);
}

/** Remitente / destinatario en JSON de orden (empresa). */
export interface CorreoSenderJson {
  name: string;
  email?: string;
  phone?: string;
  cellPhone?: string;
  streetName?: string;
  streetNumber?: string;
  city?: string;
  floor?: string;
  apartment?: string;
}

export interface CorreoOriginConfig {
  postalCode: string;
  provinceCode: string;
}

export interface MicorreoDimensions {
  weight: number;
  height: number;
  width: number;
  length: number;
}

export interface MicorreoImportBody {
  customerId: string;
  extOrderId: string;
  sender: MicorreoParty;
  recipient: MicorreoParty;
  shipping: {
    deliveryType: 'D' | 'S';
    productType?: 'CP';
    agency?: string;
    address?: MicorreoPostalAddress;
    weight: number;
    declaredValue: number;
    height: number;
    width: number;
    length: number;
  };
}

export interface MicorreoParty {
  name: string;
  email?: string;
  phone?: string;
  originAddress?: MicorreoPostalAddress;
}

export interface MicorreoPostalAddress {
  streetName: string;
  streetNumber: string;
  floor?: string;
  department?: string;
  city: string;
  /** Código oficial MiCorreo (una letra A–Z). */
  provinceCode: string;
  postalCode: string;
}

/** Cotización interna (respuesta mapeada de POST /rates). */
export interface CorreoShippingQuote {
  serviceCode?: string;
  serviceName?: string;
  price: number;
  currency: string;
  raw?: unknown;
}

export interface CorreoQuoteInput {
  postalCodeOrigin: string;
  postalCodeDestination: string;
  dimensions: MicorreoDimensions;
  deliveredType?: 'D' | 'S';
}

/** Dirección anidada en respuesta GET /agencies (MiCorreo v1). */
export interface CorreoMicorreoAgencyAddress {
  streetName?: string;
  streetNumber?: string;
  floor?: string | null;
  apartment?: string | null;
  locality?: string;
  city?: string;
  provinceCode?: string;
  postalCode?: string;
  province?: string;
}

export interface CorreoMicorreoAgencyLocation {
  address?: CorreoMicorreoAgencyAddress;
  latitude?: string;
  longitude?: string;
}

export interface CorreoMicorreoAgencyServices {
  packageReception?: boolean;
  pickupAvailability?: boolean;
}

export interface CorreoAgencyRaw {
  id?: string;
  agencyCode?: string;
  agency_id?: string;
  code?: string;
  name?: string;
  nombre?: string;
  address?: string;
  domicilio?: string;
  city?: string;
  ciudad?: string;
  state?: string;
  provincia?: string;
  provinceCode?: string;
  zipCode?: string;
  codigo_postal?: string;
  postalCode?: string;
  schedule?: string;
  horario?: string;
  phone?: string;
  telefono?: string;
  email?: string;
  latitude?: string;
  latitud?: string;
  longitude?: string;
  longitud?: string;
  pickup_availability?: boolean;
  pickupAvailability?: boolean;
  package_reception?: boolean;
  packageReception?: boolean;
  location?: CorreoMicorreoAgencyLocation;
  services?: CorreoMicorreoAgencyServices;
}

export interface CorreoTrackingEventRaw {
  status_id?: string;
  statusId?: string;
  status?: string;
  estado?: string;
  date?: string;
  fecha?: string;
  facility?: string;
  sucursal?: string;
}
