/**
 * Tipos de request/response de la API REST de Mercado Pago.
 * Solo formas de la API pública; sin modelos de dominio (Pedido, etc.).
 */

export interface MercadoPagoBackUrls {
  success?: string;
  failure?: string;
  pending?: string;
}

export interface MercadoPagoPreferenceItem {
  id?: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
  picture_url?: string;
  category_id?: string;
}

/** Body para POST /checkout/preferences */
export interface MercadoPagoCreatePreferenceBody {
  items: MercadoPagoPreferenceItem[];
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: {
      area_code?: string;
      number?: string;
    };
    identification?: {
      type?: string;
      number?: string;
    };
    address?: {
      street_name?: string;
      street_number?: number | string;
      zip_code?: string;
    };
  };
  back_urls?: MercadoPagoBackUrls;
  auto_return?: 'approved' | 'all';
  external_reference?: string;
  notification_url?: string;
  statement_descriptor?: string;
  expires?: boolean;
  expiration_date_from?: string;
  expiration_date_to?: string;
  payment_methods?: {
    default_installments?: number;
    installments?: number;
    excluded_payment_types?: Array<{ id: string }>;
    excluded_payment_methods?: Array<{ id: string }>;
  };
  metadata?: Record<string, string>;
}

export interface MercadoPagoPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  client_id?: string;
  collector_id?: number;
  operation_type?: string;
  date_created?: string;
  last_updated?: string;
  external_reference?: string;
  [key: string]: unknown;
}

/** Respuesta de GET /v1/payments/:id — campos usuales para conciliación y webhooks */
export interface MercadoPagoPayment {
  id: number;
  date_created: string;
  date_approved: string | null;
  date_last_updated: string;
  money_release_date: string | null;
  operation_type: string;
  issuer_id: string | null;
  payment_method_id: string;
  payment_type_id: string;
  status: string;
  status_detail: string;
  currency_id: string;
  description: string | null;
  live_mode: boolean;
  collector_id: number;
  payer: {
    id: number | null;
    email: string;
    identification: { type: string; number: string } | null;
    first_name: string | null;
    last_name: string | null;
    phone: {
      area_code: string;
      number: string;
      extension: string;
    } | null;
  };
  metadata: Record<string, unknown>;
  external_reference: string | null;
  transaction_amount: number;
  transaction_details: {
    payment_method_reference_id: string | null;
    net_received_amount: number;
    total_paid_amount: number;
    overpaid_amount: number;
    external_resource_url: string | null;
    installment_amount: number;
    financial_institution: string | null;
    payable_deferral_period: string | null;
  };
  fee_details: Array<{
    type: string;
    amount: number;
    fee_payer: string;
  }>;
  installments: number;
  preference_id: string | null;
  notification_url: string | null;
  processing_mode: string | null;
  [key: string]: unknown;
}

export interface MercadoPagoPaymentSearchResponse {
  paging?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
  results: MercadoPagoPayment[];
}
