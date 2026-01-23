// src/services/sfactory/sfactory.client.ts
import dotenv from 'dotenv';
import { sfactoryAuthService } from './sfactory-auth.service';

dotenv.config();

interface SFactoryAuthBody {
  auth: {
    userdev: string;
    password: string;
  };
  service: {
    module: string;
    method: string;
  };
  parameters: any;
}

export class SFactoryClient {
  private baseURL: string;

  // Credenciales desde .env (solo las necesarias para las peticiones)
  private readonly userdev: string;
  private readonly password: string;
  private readonly companyKey: string;

  constructor() {
    this.baseURL = process.env.SFACTORY_API_URL || '';
    this.userdev = process.env.SFACTORY_USERDEV || '';
    this.password = process.env.SFACTORY_PASSWORD || '';
    this.companyKey = process.env.SFACTORY_COMPANY_KEY || '';
  }

  /**
   * Hacer petición a S-Factory
   * 
   * La autenticación se maneja automáticamente a través de sfactoryAuthService:
   * - Verifica si hay token válido en BD
   * - Autentica si es necesario
   * - Guarda el token en BD
   */
  async request<T = any>(
    module: string,
    method: string,
    parameters: any = {},
    companyKey?: string
  ): Promise<T> {
    // Usar companyKey proporcionado o el del constructor
    const key = companyKey || this.companyKey;
    const token = await sfactoryAuthService.getToken(key);

    const body: SFactoryAuthBody & { credential: any } = {
      auth: {
        userdev: this.userdev,
        password: this.password,
      },
      service: {
        module,
        method,
      },
      credential: {
        data: token,
        companyKey: key,
      },
      parameters,
    };

    try {
      // Para peticiones de datos, usar el endpoint /main
      let apiURL = this.baseURL;
      if (!apiURL.endsWith('/main') && !apiURL.endsWith('/main/')) {
        if (apiURL.endsWith('/api')) {
          apiURL = `${apiURL}/main`;
        } else if (apiURL.endsWith('/api/')) {
          apiURL = `${apiURL}main`;
        } else {
          apiURL = `${apiURL}/main`;
        }
      }
      
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const rawData = await response.json();

      // La respuesta de SFactory tiene estructura:
      // { service: {...}, result: { success: boolean, ... }, response: { data: [...] } }
      const data = rawData as {
        result?: {
          success: boolean;
          message?: string;
          state?: number;
        };
        response?: T | { data?: any };
      };

      // Verificar si result existe y si success es false
      if (data.result && !data.result.success) {
        throw new Error(data.result.message || 'Error en S-Factory API');
      }

      // Extraer los datos de response
      if (!data.response) {
        throw new Error('La respuesta de S-Factory no contiene el campo "response"');
      }

      return data.response as T;

    } catch (error: any) {
      throw error;
    }
  }
}

// Singleton
export const sfactoryClient = new SFactoryClient();