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

