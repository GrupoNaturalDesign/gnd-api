export type ShippingProviderName = 'correo' | 'andreani';

export type ShippingDeliveryType = 'homeDelivery' | 'agency';

export interface ShippingAddress {
  streetName: string;
  streetNumber: string;
  city: string;
  state: string;
  zipCode: string;
  floor?: string;
  department?: string;
}

export interface ShippingParcel {
  weightGrams: number;
  height: number;
  width: number;
  depth: number;
  declaredValue: number;
}

export interface CreateShippingOrderInput {
  pedidoId: number;
  empresaId: number;
  /** Si falta, se usa `providerDefault` de EmpresaEnvioConfig. */
  provider?: ShippingProviderName;
  deliveryType: ShippingDeliveryType;
  agencyId?: string;
  recipient: {
    name: string;
    email?: string;
    phone?: string;
  };
  address?: ShippingAddress;
  parcel: ShippingParcel;
}

export interface ShippingOrderResult {
  trackingNumber: string;
  provider: ShippingProviderName;
  /** Agrupador de bultos Andreani (etiquetas); solo si provider === 'andreani'. */
  andreaniAgrupadorBultos?: string | null;
}

/** Contexto opcional para proveedores que necesitan datos extra (ej. Andreani + agrupador en BD). */
export interface ShippingLabelContext {
  pedidoId?: number;
  empresaId?: number;
}

export interface ShippingLabel {
  trackingNumber: string;
  fileBase64: string;
  fileName: string;
}

export interface ShippingTrackingEvent {
  statusId: string;
  status: string;
  date: string;
  facility: string;
}

export interface ShippingTrackingResult {
  trackingNumber: string;
  provider: ShippingProviderName;
  events: ShippingTrackingEvent[];
}

export interface ShippingAgency {
  agencyId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  schedule: string;
  phone?: string;
  email?: string;
  latitude?: string;
  longitude?: string;
  pickupAvailability: boolean;
  packageReception: boolean;
}

export interface AgencyFilters {
  stateId?: string;
  pickupAvailability?: boolean;
  packageReception?: boolean;
}
