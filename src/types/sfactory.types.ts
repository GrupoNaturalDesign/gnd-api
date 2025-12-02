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
  id: number;
  codigo: string;
  descripcion: string;
  precio?: number;
  stock?: number;
  rubro_id?: number;
  subrubro_id?: number;
  activo?: boolean;
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
  codigo: string;
  razon_social: string;
  nombre?: string;
  cuit?: string;
  email?: string;
  telefono?: string;
  [key: string]: any;
}

