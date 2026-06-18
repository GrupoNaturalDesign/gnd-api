import type { Prisma } from '@prisma/client';
import type {
  AgencyFilters,
  CreateShippingOrderInput,
  ShippingAddress,
  ShippingAgency,
  ShippingProviderName,
  ShippingTrackingEvent,
  ShippingTrackingResult,
} from '../shipping.types';
import { ShippingValidationError } from '../shipping.errors';
import type {
  CorreoAgencyRaw,
  CorreoOriginConfig,
  CorreoQuoteInput,
  CorreoSenderJson,
  CorreoShippingQuote,
  CorreoTrackingEventRaw,
  MicorreoDimensions,
  MicorreoImportBody,
  MicorreoParty,
  MicorreoPostalAddress,
} from './correo.types';
import { getProvinceCode } from './correo.types';
import { normalizeMicorreoPostalCode } from './correo-postal.util';

const PROVIDER: ShippingProviderName = 'correo';

function intDim(n: number): number {
  return Math.max(0, Math.round(Number(n)));
}

function intWeightGrams(g: number): number {
  return Math.max(1, Math.round(Number(g)));
}

export function parseCorreoSenderData(json: Prisma.JsonValue | null): CorreoSenderJson {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    throw new ShippingValidationError(
      'correoSenderData debe ser un objeto JSON con al menos name'
    );
  }
  const o = json as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) {
    throw new ShippingValidationError('correoSenderData.name es obligatorio');
  }
  return {
    name,
    email: typeof o.email === 'string' ? o.email : undefined,
    phone: typeof o.phone === 'string' ? o.phone : undefined,
    cellPhone: typeof o.cellPhone === 'string' ? o.cellPhone : undefined,
    streetName: typeof o.streetName === 'string' ? o.streetName : undefined,
    streetNumber: typeof o.streetNumber === 'string' ? o.streetNumber : undefined,
    city: typeof o.city === 'string' ? o.city : undefined,
    floor: typeof o.floor === 'string' ? o.floor : undefined,
    apartment: typeof o.apartment === 'string' ? o.apartment : undefined,
  };
}

function buildSenderParty(
  sender: CorreoSenderJson,
  origin: CorreoOriginConfig
): MicorreoImportBody['sender'] {
  const streetName = sender.streetName?.trim() || '—';
  const streetNumber = sender.streetNumber?.trim() || '0';
  const city = sender.city?.trim() || 'Origen';
  return {
    name: sender.name,
    email: sender.email,
    phone: sender.phone,
    originAddress: {
      streetName,
      streetNumber,
      floor: sender.floor?.trim() || undefined,
      department: sender.apartment?.trim() || undefined,
      city,
      provinceCode: origin.provinceCode,
      postalCode: origin.postalCode,
    },
  };
}

function mapPostalAddress(addr: ShippingAddress): MicorreoPostalAddress {
  const pc = addr.zipCode.trim();
  const prov =
    getProvinceCode(addr.state.trim()) ?? addr.state.trim().toUpperCase().slice(0, 1);
  if (!/^[A-Z]$/.test(prov)) {
    throw new ShippingValidationError(
      `No se pudo resolver código de provincia para: ${addr.state}`
    );
  }
  return {
    streetName: addr.streetName,
    streetNumber: addr.streetNumber,
    floor: addr.floor,
    department: addr.department,
    city: addr.city,
    provinceCode: prov,
    postalCode: pc,
  };
}

function buildRecipientParty(input: CreateShippingOrderInput): MicorreoParty {
  return {
    name: input.recipient.name,
    email: input.recipient.email,
    phone: input.recipient.phone,
  };
}

export function mapCreateOrderToMicorreoImport(
  input: CreateShippingOrderInput,
  customerId: string,
  senderData: Prisma.JsonValue | null,
  origin: CorreoOriginConfig,
  options?: { extOrderId?: string }
): MicorreoImportBody {
  const extOrderId = options?.extOrderId ?? String(input.pedidoId);
  if (input.deliveryType === 'homeDelivery' && !input.address) {
    throw new ShippingValidationError('address es obligatorio para envío a domicilio');
  }
  if (input.deliveryType === 'agency' && !input.agencyId) {
    throw new ShippingValidationError('agencyId es obligatorio para retiro en sucursal');
  }

  const sender = buildSenderParty(parseCorreoSenderData(senderData), origin);
  const dims: MicorreoDimensions = {
    weight: intWeightGrams(input.parcel.weightGrams),
    height: intDim(input.parcel.height),
    width: intDim(input.parcel.width),
    length: intDim(input.parcel.depth),
  };
  const declaredValue = Math.round(input.parcel.declaredValue);
  const shippingBase = {
    productType: 'CP' as const,
    weight: dims.weight,
    height: dims.height,
    width: dims.width,
    length: dims.length,
    declaredValue,
  };
  const recipient = buildRecipientParty(input);

  if (input.deliveryType === 'homeDelivery' && input.address) {
    return {
      customerId,
      extOrderId,
      sender,
      recipient,
      shipping: {
        deliveryType: 'D',
        ...shippingBase,
        address: mapPostalAddress(input.address),
      },
    };
  }

  return {
    customerId,
    extOrderId,
    sender,
    recipient,
    shipping: {
      deliveryType: 'S',
      ...shippingBase,
      agency: input.agencyId?.trim(),
    },
  };
}

export function mapRatesResponse(data: unknown): CorreoShippingQuote[] {
  if (data == null) return [];
  const o = data as Record<string, unknown>;
  const rates = o.rates ?? o.data;
  if (!Array.isArray(rates)) return [];
  const out: CorreoShippingQuote[] = [];
  for (const r of rates) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const priceRaw =
      row.price ?? row.amount ?? row.total ?? row.tarifa ?? row.costo;
    const price =
      typeof priceRaw === 'number'
        ? priceRaw
        : typeof priceRaw === 'string'
          ? Number.parseFloat(priceRaw)
          : NaN;
    if (!Number.isFinite(price)) continue;
    const serviceCode =
      typeof row.serviceCode === 'string'
        ? row.serviceCode
        : typeof row.productType === 'string'
          ? row.productType
          : typeof row.code === 'string'
            ? row.code
            : undefined;
    const serviceName =
      typeof row.serviceName === 'string'
        ? row.serviceName
        : typeof row.productName === 'string'
          ? row.productName
          : typeof row.name === 'string'
            ? row.name
            : undefined;
    const currency =
      typeof row.currency === 'string' ? row.currency : 'ARS';
    out.push({
      serviceCode,
      serviceName,
      price,
      currency,
      raw: r,
    });
  }
  return out;
}

export function mapCorreoTrackingResponseToResults(
  data: unknown,
  trackingNumbers: string[]
): ShippingTrackingResult[] {
  const fallbackTn = trackingNumbers[0] ?? '';

  if (data == null) {
    return [
      {
        trackingNumber: fallbackTn,
        provider: PROVIDER,
        events: [],
      },
    ];
  }

  if (Array.isArray(data)) {
    const events: ShippingTrackingEvent[] = [];
    for (const e of data) {
      if (e && typeof e === 'object') {
        events.push(mapOneTrackingEvent(e as CorreoTrackingEventRaw));
      }
    }
    return [
      {
        trackingNumber: fallbackTn,
        provider: PROVIDER,
        events,
      },
    ];
  }

  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.error === 'string' || o.error === true) {
      return [
        {
          trackingNumber: fallbackTn,
          provider: PROVIDER,
          events: [],
        },
      ];
    }
    const eventsRaw = o.events ?? o.eventos ?? o.history;
    const events: ShippingTrackingEvent[] = [];
    if (Array.isArray(eventsRaw)) {
      for (const e of eventsRaw) {
        if (e && typeof e === 'object') {
          events.push(mapOneTrackingEvent(e as CorreoTrackingEventRaw));
        }
      }
    }
    const tn =
      (typeof o.trackingNumber === 'string' ? o.trackingNumber : undefined) ??
      (typeof o.shippingId === 'string' ? o.shippingId : undefined) ??
      fallbackTn;
    return [
      {
        trackingNumber: tn,
        provider: PROVIDER,
        events,
      },
    ];
  }

  return [
    {
      trackingNumber: fallbackTn,
      provider: PROVIDER,
      events: [],
    },
  ];
}

function mapOneTrackingEvent(raw: CorreoTrackingEventRaw): ShippingTrackingEvent {
  const statusId =
    (typeof raw.status_id === 'string' ? raw.status_id : undefined) ??
    (typeof raw.statusId === 'string' ? raw.statusId : undefined) ??
    '';
  const status =
    (typeof raw.status === 'string' ? raw.status : undefined) ??
    (typeof raw.estado === 'string' ? raw.estado : undefined) ??
    '';
  const date =
    (typeof raw.date === 'string' ? raw.date : undefined) ??
    (typeof raw.fecha === 'string' ? raw.fecha : undefined) ??
    '';
  const facility =
    (typeof raw.facility === 'string' ? raw.facility : undefined) ??
    (typeof raw.sucursal === 'string' ? raw.sucursal : undefined) ??
    '';
  return { statusId, status, date, facility };
}

/** MiCorreo anida dirección y flags; sin esto `state` queda vacío y el filtro por provincia borra todo. */
function mapMicorreoNestedAgency(raw: CorreoAgencyRaw): {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  schedule?: string;
  latitude?: string;
  longitude?: string;
  pickupAvailability?: boolean;
  packageReception?: boolean;
} {
  const loc = raw.location;
  if (!loc || typeof loc !== 'object') return {};

  const addr = loc.address;
  let address = '';
  let city = '';
  let state = '';
  let zipCode = '';

  if (addr && typeof addr === 'object') {
    const sn = typeof addr.streetName === 'string' ? addr.streetName.trim() : '';
    const num = typeof addr.streetNumber === 'string' ? addr.streetNumber.trim() : '';
    const parts = [sn, num].filter(Boolean);
    address = parts.join(' ').trim();
    const locality =
      typeof addr.locality === 'string' ? addr.locality.trim() : '';
    const cityField = typeof addr.city === 'string' ? addr.city.trim() : '';
    city = locality || cityField;
    const pc =
      typeof addr.provinceCode === 'string' ? addr.provinceCode.trim().toUpperCase() : '';
    const provName =
      typeof addr.province === 'string' ? addr.province.trim() : '';
    if (pc.length === 1 && /^[A-Z]$/.test(pc)) {
      state = pc;
    } else if (provName) {
      state = getProvinceCode(provName) ?? provName;
    }
    const postal =
      typeof addr.postalCode === 'string' ? addr.postalCode.trim() : '';
    if (postal) zipCode = postal;
  }

  const latitude =
    typeof loc.latitude === 'string' ? loc.latitude : undefined;
  const longitude =
    typeof loc.longitude === 'string' ? loc.longitude : undefined;

  const svc = raw.services;
  let pickupAvailability: boolean | undefined;
  let packageReception: boolean | undefined;
  if (svc && typeof svc === 'object') {
    if (typeof svc.pickupAvailability === 'boolean') {
      pickupAvailability = svc.pickupAvailability;
    }
    if (typeof svc.packageReception === 'boolean') {
      packageReception = svc.packageReception;
    }
  }

  return {
    ...(address ? { address } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(zipCode ? { zipCode } : {}),
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
    ...(pickupAvailability !== undefined ? { pickupAvailability } : {}),
    ...(packageReception !== undefined ? { packageReception } : {}),
  };
}

function mapOneAgency(raw: CorreoAgencyRaw): ShippingAgency | null {
  const nested = mapMicorreoNestedAgency(raw);

  const agencyId =
    (typeof raw.agencyCode === 'string' ? raw.agencyCode : undefined) ??
    (typeof raw.code === 'string' ? raw.code : undefined) ??
    (typeof raw.agency_id === 'string' ? raw.agency_id : undefined) ??
    (typeof raw.id === 'string' ? raw.id : undefined);
  const name =
    (typeof raw.name === 'string' ? raw.name : undefined) ??
    (typeof raw.nombre === 'string' ? raw.nombre : undefined);
  if (!agencyId || !name) return null;

  const address =
    nested.address ??
    (typeof raw.address === 'string' ? raw.address : undefined) ??
    (typeof raw.domicilio === 'string' ? raw.domicilio : undefined) ??
    '';
  const city =
    nested.city ??
    (typeof raw.city === 'string' ? raw.city : undefined) ??
    (typeof raw.ciudad === 'string' ? raw.ciudad : undefined) ??
    '';
  const state =
    nested.state ??
    (typeof raw.state === 'string' ? raw.state : undefined) ??
    (typeof raw.provincia === 'string' ? raw.provincia : undefined) ??
    (typeof raw.provinceCode === 'string' ? raw.provinceCode : undefined) ??
    '';
  const zipCode =
    nested.zipCode ??
    (typeof raw.zipCode === 'string' ? raw.zipCode : undefined) ??
    (typeof raw.postalCode === 'string' ? raw.postalCode : undefined) ??
    (typeof raw.codigo_postal === 'string' ? raw.codigo_postal : undefined) ??
    '';
  const schedule =
    nested.schedule ??
    (typeof raw.schedule === 'string' ? raw.schedule : undefined) ??
    (typeof raw.horario === 'string' ? raw.horario : undefined) ??
    '';
  const phone =
    (typeof raw.phone === 'string' ? raw.phone : undefined) ??
    (typeof raw.telefono === 'string' ? raw.telefono : undefined);
  const email = typeof raw.email === 'string' ? raw.email : undefined;
  const latitude =
    nested.latitude ??
    (typeof raw.latitude === 'string' ? raw.latitude : undefined) ??
    (typeof raw.latitud === 'string' ? raw.latitud : undefined);
  const longitude =
    nested.longitude ??
    (typeof raw.longitude === 'string' ? raw.longitude : undefined) ??
    (typeof raw.longitud === 'string' ? raw.longitud : undefined);
  const pickupAvailability =
    nested.pickupAvailability !== undefined
      ? nested.pickupAvailability
      : typeof raw.pickup_availability === 'boolean'
        ? raw.pickup_availability
        : typeof raw.pickupAvailability === 'boolean'
          ? raw.pickupAvailability
          : false;
  const packageReception =
    nested.packageReception !== undefined
      ? nested.packageReception
      : typeof raw.package_reception === 'boolean'
        ? raw.package_reception
        : typeof raw.packageReception === 'boolean'
          ? raw.packageReception
          : true;

  return {
    agencyId,
    name,
    address,
    city,
    state,
    zipCode,
    schedule,
    phone,
    email,
    latitude,
    longitude,
    pickupAvailability,
    packageReception,
  };
}

export function mapCorreoAgenciesResponse(data: unknown): ShippingAgency[] {
  const out: ShippingAgency[] = [];
  let rows: unknown[] = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const r = o.results ?? o.data ?? o.agencies ?? o.items;
    if (Array.isArray(r)) rows = r;
  }
  for (const row of rows) {
    if (row && typeof row === 'object') {
      const m = mapOneAgency(row as CorreoAgencyRaw);
      if (m) out.push(m);
    }
  }
  return out;
}

function resolveProvinceFilter(filters: AgencyFilters): string | undefined {
  if (filters.stateId == null || filters.stateId === '') return undefined;
  const s = filters.stateId.trim();
  if (s.length === 1 && /[a-zA-Z]/.test(s)) return s.toUpperCase();
  return getProvinceCode(s);
}

export function filterAgenciesByQuery(
  agencies: ShippingAgency[],
  filters: AgencyFilters
): ShippingAgency[] {
  const prov = resolveProvinceFilter(filters);
  return agencies.filter((a) => {
    if (prov != null && prov !== '') {
      const st = a.state.trim().toUpperCase();
      if (st !== prov && !st.includes(prov)) return false;
    }
    if (filters.pickupAvailability === true && !a.pickupAvailability) return false;
    if (filters.packageReception === true && !a.packageReception) return false;
    return true;
  });
}

export function buildRatesRequestBody(
  customerId: string,
  input: CorreoQuoteInput
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    customerId,
    postalCodeOrigin: normalizeMicorreoPostalCode(input.postalCodeOrigin),
    postalCodeDestination: normalizeMicorreoPostalCode(input.postalCodeDestination),
    dimensions: {
      weight: intWeightGrams(input.dimensions.weight),
      height: intDim(input.dimensions.height),
      width: intDim(input.dimensions.width),
      length: intDim(input.dimensions.length),
    },
  };
  if (input.deliveredType != null) {
    body.deliveredType = input.deliveredType;
  }
  return body;
}
