// ============================================
// S-Factory API Types
// ============================================

export interface SFactoryAuthRequest {
  auth: {
    userdev: string;
    password: string;
  };
  service: {
    module: string;
    method: string;
  };
  parameters: {
    user_factory: string;
    password_factory: string;
    companyKey: string;
  };
}

export interface SFactoryAuthResponse {
  success: boolean;
  data?: {
    token: string;
    user_id: number;
    company_id: number;
  };
  error?: string;
}

export interface SFactoryProduct {
  Codigo: string;
  Tipo?: string | null;
  Descripcion?: string | null;
  UM?: string | null;
  Rubro?: string | null;
  Subrubro?: string | null;
  Activo?: boolean | null;
  Moneda?: string | null;
  PrecioCosto?: number | null;
  PrecioVenta?: number | null;
  Stock?: number | null;
  Barcode?: string | null;
  Talle?: string | null;
  Color?: string | null;
  Linea?: string | null;
  Material?: string | null;
  rubro_id?: number;
  subrubro_id?: number;
  id?: number;
  [key: string]: any;
}

export interface SFactoryRubro {
  id: number;
  codigo: string;
  nombre: string;
  [key: string]: any;
}

export interface SFactorySubrubro {
  id: number;
  codigo: string;
  nombre: string;
  rubro_id: number;
  [key: string]: any;
}

export interface SFactoryCliente {
  id: number;
  active: number;
  code: string;
  legal_name: string;
  name: string | null;
  type: string | null;
  notes: string | null;
  fiscal_category_code: string | null;
  fiscal_category: string | null;
  tax_id: string | null;
  sales_person_id: number | null;
  sales_person: string | null;
  price_list_id: number | null;
  price_list_code: string | null;
  fiscal_address: string | null;
  fiscal_locality: string | null;
  fiscal_province: string | null;
  fiscal_locality_id: number | null;
  fiscal_province_id: number | null;
  fiscal_country_id: number | null;
  fiscal_zip_code: string | null;
  postal_address: string | null;
  postal_locality_id: number | null;
  postal_province_id: number | null;
  postal_country_id: number | null;
  postal_zip_code: string | null;
  birth_date: string | null;
  bank: string | null;
  bank_cbu: string | null;
  marital_status: string | null;
  phones: string | null;
  mobile: string | null;
  email: string | null;
  account_id: number | null;
  website: string | null;
  external_id: string | null;
  group_id: number | null;
  group: string | null;
  contact_person: string | null;
  creation_date: string | null;
  created_by: string | null;
  modification_date: string | null;
  modified_by: string | null;
  [key: string]: any;
}

export interface SFactoryClienteCreate {
  codigo: string;
  nombre: string;
  razon_social: string;
  cuit?: number;
  categoria_fiscal?: string;
  telefono?: number;
  movil?: number;
  codigo_externo?: number;
  ctb_id?: number;
  cuenta_id?: number;
  email?: string;
  domicilio_fiscal?: string;
  localidad_fiscal_id?: number;
  cp_fiscal?: number;
  provincia_id?: number;
  pais_id?: number;
}

export interface SFactoryClienteCreateResponse {
  id: number;
  code: string;
  success: boolean;
  message?: string;
  [key: string]: any;
}

export interface SFactoryCodigoClienteResponse {
  codigo: string;
  code?: string;
  [key: string]: any;
}

// ============================================
// S-Factory Item (Producto) Types
// ============================================

/**
 * Datos para crear un item en SFactory
 */
export interface SFactoryItemCreateData {
  codigo?: string | null;
  tipo: string; // "P" para producto
  descripcion: string;
  descrip_corta?: string | null;
  detalle?: string | null;
  precio_costo?: number | null;
  precio_venta?: number | null;
  moneda_id?: number | null;
  utilidad_planificada?: number | null;
  iva?: number | null;
  stock_minimo?: number | null;
  stock_maximo?: number | null;
  rubro_id?: number | null;
  subrubro_id?: number | null;
  stockeable?: number | null; // 1 o 0
  item_compra?: number | null; // 1 o 0
  item_venta?: number | null; // 1 o 0
  item_alquiler?: number | null; // 1 o 0
  um_id?: number | null;
  um_compra_id?: number | null;
  usa_lote?: boolean | null;
  usa_serie?: number | null; // 1 o 0
  usa_vencimiento?: number | null; // 1 o 0
  cta_ingresos_id?: number | null;
  cta_costo_venta_id?: number | null;
  cta_egresos_id?: number | null;
  barcode?: string | null;
  clase_id?: number | null;
  linea_id?: number | null;
  ctb_id?: number | null;
  [key: string]: any;
}

/**
 * Datos para editar un item en SFactory
 */
export interface SFactoryItemEditData extends SFactoryItemCreateData {
  item_id: number;
}

/**
 * Respuesta al crear un item en SFactory
 */
export interface SFactoryItemCreateResponse {
  id?: number;
  codigo?: string;
  Codigo?: string;
  success?: boolean;
  message?: string;
  [key: string]: any;
}

/**
 * Respuesta al editar un item en SFactory
 */
export interface SFactoryItemEditResponse {
  id?: number;
  codigo?: string;
  Codigo?: string;
  success?: boolean;
  message?: string;
  [key: string]: any;
}

// ============================================
// S-Factory Ventas — Orden de pedido (legacy)
// ============================================
//
// SFactoryCrearOrdenPedidoParams / ventas_crear_orden_pedido: IDs internos y totales manuales.
// El checkout web usa ventas_crear_pedido_externo — ver SFactoryCrearPedidoExternoParams.

export interface SFactoryListarOrdenPedidoParams {
  desde: string;
  hasta: string;
  comercial_id: number;
  empresa_id: number;
}

export interface SFactoryOrdenPedidoItem {
  item_id: number;
  descripcion: string;
  cantidad: string;
  um_id: number;
  precio: number;
  descuento: number;
  iva: number;
  importe: number;
  fecha_entrega: string;
  especificaciones?: string;
  lista_precio_id: number;
  reserva_stock: boolean;
  reserva_deposito_id: number;
  reserva_cantidad: number;
  [key: string]: unknown;
}

export interface SFactoryOrdenPedidoData {
  id?: number;
  estado: string;
  fecha: string;
  titulo: string;
  cliente_id: number;
  fecha_entrega: string;
  observaciones?: string;
  ref_cliente?: string;
  num_orden_compra?: string;
  comercial_id: number;
  venta_condiciones?: string;
  unidad_negocio_id: number;
  neto: number;
  iva: number;
  total: number;
  bonificacion: number;
  moneda_id: number;
  cotizacion: number;
  cotizacion_id: number;
  origen_venta_id: number;
  sucursal_id: number;
  condiciones_venta?: string;
  centro_costo: number;
  entrega_cliente_dir_id: number;
  entrega_localidad_id: number;
  entrega_direccion: string;
  entrega_cp: string;
  entrega_notas?: string;
  empresa_id: number;
  [key: string]: unknown;
}

/** @deprecated Solo para pruebas o integraciones legacy con ventas_crear_orden_pedido */
export interface SFactoryCrearOrdenPedidoParams {
  data: SFactoryOrdenPedidoData;
  items: SFactoryOrdenPedidoItem[];
}

export interface SFactoryEditarOrdenPedidoParams {
  data: SFactoryOrdenPedidoData;
  items: SFactoryOrdenPedidoItem[];
  items_deleted?: string[];
}

// ─── ventas_crear_pedido_externo ─────────────────────────────────────────────

export interface SFactoryPedidoExternoCliente {
  /** Nombre o razón social. Obligatorio si el cliente no existe en SFactory. */
  nombre?: string;
  /** CUIT sin guiones, exactamente 11 dígitos. Requerido si no se envía email. */
  cuit?: string;
  /** Email válido. Requerido si no se envía cuit. */
  email?: string;
  razon_social?: string;
  telefono?: string;
  movil?: string;
}

export interface SFactoryPedidoExternoItem {
  /** Código del ítem en SFactory (items.codigo). Debe estar activo. */
  sku: string;
  /** Cantidad mayor a 0. */
  cantidad: number;
  /** Precio unitario sin impuesto. Default: 0. */
  precio?: number;
  /** Descuento en porcentaje 0–100. Default: 0. */
  descuento?: number;
  /** Alícuota IVA. Si se omite usa el configurado en el ítem. */
  iva?: 0 | 10.5 | 21 | 27;
  descripcion?: string;
  /** YYYY-MM-DD */
  fecha_entrega?: string;
  especificaciones?: string;
  notas?: string;
}

export interface SFactoryPedidoExternoEntrega {
  /** Obligatorio si se envía el bloque entrega. */
  provincia: string;
  localidad: string;
  direccion: string;
  cp: string;
  localidad_id?: number;
  notas?: string;
}

/** Cumplimiento en S-Factory al crear pedido externo (shipping / remito / reserva). */
export type SFactoryPedidoFulfillmentMode = 'none' | 'reserve' | 'deliver';

export interface SFactoryPedidoExternoFulfillment {
  mode?: string;
  success?: boolean;
  message?: string;
  document?: unknown;
}

export interface SFactoryCrearPedidoExternoParams {
  /** Identificador del sistema externo. Debe tener config activa en SFactory. */
  source: string;
  /** ID del pedido en el sistema externo. Para trazabilidad y evitar duplicados. */
  ext_order_id: string;
  /** YYYY-MM-DD. Default: fecha actual. */
  fecha?: string;
  /** YYYY-MM-DD. Fecha de entrega del pedido completo. */
  fecha_entrega?: string;
  titulo?: string;
  observaciones?: string;
  ref_cliente?: string;
  num_orden_compra?: string;
  condiciones_venta?: string;
  cliente: SFactoryPedidoExternoCliente;
  /** Mínimo 1 ítem. */
  items: [SFactoryPedidoExternoItem, ...SFactoryPedidoExternoItem[]];
  entrega?: SFactoryPedidoExternoEntrega;
  /**
   * Override de cumplimiento. `none` evita reserva/remito en S-Factory (envío postal en GND).
   * Si se omite, S-Factory resuelve reglas vía `vta_origen_shipping_rule` del source.
   */
  fulfillment_mode?: SFactoryPedidoFulfillmentMode;
  /** Código de modalidad de envío en S-Factory; normalmente no se envía si hay fulfillment_mode. */
  shipping_type?: string;
}

export interface SFactoryCrearPedidoExternoResponse {
  id: number;
  estado: string;
  fecha: string;
  total: number;
  fulfillment?: SFactoryPedidoExternoFulfillment;
}