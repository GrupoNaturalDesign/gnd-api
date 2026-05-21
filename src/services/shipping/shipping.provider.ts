import type {
  AgencyFilters,
  CreateShippingOrderInput,
  ShippingAgency,
  ShippingLabel,
  ShippingLabelContext,
  ShippingOrderResult,
  ShippingProviderName,
  ShippingTrackingResult,
} from './shipping.types';

export interface ShippingProvider {
  readonly providerName: ShippingProviderName;
  validateCredentials(): Promise<void>;
  createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult>;
  cancelOrder(trackingNumber: string): Promise<void>;
  getLabel(
    trackingNumber: string,
    context?: ShippingLabelContext
  ): Promise<ShippingLabel>;
  getTracking(trackingNumbers: string[]): Promise<ShippingTrackingResult[]>;
  getAgencies(filters: AgencyFilters): Promise<ShippingAgency[]>;
}
