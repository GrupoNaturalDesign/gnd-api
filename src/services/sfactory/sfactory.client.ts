// src/services/sfactory/sfactory.client.ts
import dotenv from 'dotenv';

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

interface SFactoryAuthResponse {
  result: {
    success: boolean;
    state: number;
    message: string;
  };
  response: {
    token: string;
  };
}

export class SFactoryClient {
  private baseURL: string;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  // Credenciales desde .env
  private readonly userdev: string;
  private readonly password: string;
  private readonly userFactory: string;
  private readonly passwordFactory: string;
  private readonly companyKey: string;

  constructor() {
    this.baseURL = process.env.SFACTORY_API_URL || '';
    this.userdev = process.env.SFACTORY_USERDEV || '';
    this.password = process.env.SFACTORY_PASSWORD || '';
    this.userFactory = process.env.SFACTORY_USER_FACTORY || '';
    this.passwordFactory = process.env.SFACTORY_PASSWORD_FACTORY || '';
    this.companyKey = process.env.SFACTORY_COMPANY_KEY || '';
  }

  /**
   * Obtener token de autenticación
   */
  private async authenticate(): Promise<string> {
    // Si ya tenemos un token válido, retornarlo
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const body = {
        auth: {
          userdev: this.userdev,
          password: this.password,
        },
        service: {
          module: 'Auth',
          method: 'sign_in',
        },
        parameters: {
          user_factory: this.userFactory,
          password_factory: this.passwordFactory,
          companyKey: this.companyKey,
        },
      };

      console.log('🔐 Autenticando con S-Factory...');
      
      const url = `${this.baseURL}/sign_in`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as SFactoryAuthResponse;

      if (!data.result.success) {
        throw new Error(`Error de autenticación: ${data.result.message}`);
      }

      this.token = data.response.token;
      // Token expira en 30 días según documentación
      this.tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      console.log('✅ Autenticación exitosa');
      return this.token;

    } catch (error: any) {
      console.error('❌ Error de autenticación:', error.message);
      throw new Error('No se pudo autenticar con S-Factory');
    }
  }

  /**
   * Hacer petición a S-Factory
   */
  async request<T = any>(
    module: string,
    method: string,
    parameters: any = {}
  ): Promise<T> {
    const token = await this.authenticate();

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
        companyKey: this.companyKey,
      },
      parameters,
    };

    try {
      console.log(`📡 Llamando a S-Factory: ${module}.${method}`);
      
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        result: {
          success: boolean;
          message?: string;
        };
        response: T;
      };

      if (!data.result.success) {
        throw new Error(data.result.message || 'Error en S-Factory API');
      }

      console.log(`✅ Respuesta exitosa de ${module}.${method}`);
      return data.response;

    } catch (error: any) {
      console.error(`❌ Error en ${module}.${method}:`, error.message);
      throw error;
    }
  }
}

// Singleton
export const sfactoryClient = new SFactoryClient();