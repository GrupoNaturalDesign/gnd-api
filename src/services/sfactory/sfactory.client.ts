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
   * Hacer petición a S-Factory con reintento automático y reautenticación
   * 
   * La autenticación se maneja automáticamente a través de sfactoryAuthService:
   * - Verifica si hay token válido en BD
   * - Autentica si es necesario
   * - Guarda el token en BD
   * - Si falla por token inválido, reautentica y reintenta
   */
  async request<T = any>(
    module: string,
    method: string,
    parameters: any = {},
    companyKey?: string,
    retryCount: number = 1
  ): Promise<T> {
    // Usar companyKey proporcionado o el del constructor
    const key = companyKey || this.companyKey;
    
    try {
      let token = await sfactoryAuthService.getToken(key);
      
      // Verificar que el token no esté vacío
      if (!token || token.trim() === '') {
        console.warn('[SFactoryClient] Token vacío, forzando reautenticación...');
        await sfactoryAuthService.invalidateToken(key);
        token = await sfactoryAuthService.getToken(key);
      }
      
      console.log(`[SFactoryClient] Token obtenido (primeros 20 chars): ${token.substring(0, 20)}...`);
      console.log(`[SFactoryClient] Token completo length: ${token.length}`);

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

      // Log del body completo para debugging
      console.log('[SFactoryClient] Body completo:', JSON.stringify(body, null, 2));

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
      
      console.log(`[SFactoryClient] URL completa: ${apiURL}`);
      console.log(`[SFactoryClient] Módulo: ${module}, Método: ${method}`);
      console.log(`[SFactoryClient] Body size: ${JSON.stringify(body).length} bytes`);
      console.log(`[SFactoryClient] Retry count: ${retryCount}`);
      
      // Crear AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 segundos
      
      try {
        console.log('[SFactoryClient] Iniciando fetch...');
        const startTime = Date.now();
        
        // SIMPLIFICAR HEADERS - igual que sign_in que funciona
        const response = await fetch(apiURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Remover headers adicionales que podrían causar problemas
            // 'Accept': 'application/json',
            // 'User-Agent': 'GND-API/1.0',
            // 'Connection': 'keep-alive',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          // Remover keepalive que podría causar problemas
          // keepalive: true,
        });

        const elapsedTime = Date.now() - startTime;
        console.log(`[SFactoryClient] Fetch completado en ${elapsedTime}ms`);
        console.log(`[SFactoryClient] Response status: ${response.status}`);
        console.log(`[SFactoryClient] Response ok: ${response.ok}`);
        console.log(`[SFactoryClient] Response headers:`, Object.fromEntries(response.headers.entries()));

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[SFactoryClient] HTTP error! status: ${response.status}`);
          console.error(`[SFactoryClient] Error response body: ${errorText}`);
          
          // Si es 401 o 403, podría ser token inválido
          if ((response.status === 401 || response.status === 403) && retryCount > 0) {
            console.log('[SFactoryClient] Token posiblemente inválido, esperando 2 segundos antes de reautenticar...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('[SFactoryClient] Invalidando token...');
            await sfactoryAuthService.invalidateToken(key);
            console.log('[SFactoryClient] Reintentando petición...');
            return this.request<T>(module, method, parameters, companyKey, retryCount - 1);
          }
          
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        console.log('[SFactoryClient] Parseando respuesta JSON...');
        const rawData = await response.json() as any;
        console.log('[SFactoryClient] Respuesta parseada exitosamente');
        console.log('[SFactoryClient] Estructura de respuesta:', {
          hasResult: !!rawData.result,
          hasResponse: !!rawData.response,
          resultSuccess: rawData.result?.success,
          resultMessage: rawData.result?.message,
        });

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
          const errorMsg = data.result.message || 'Error en S-Factory API';
          console.error(`[SFactoryClient] Error en respuesta: ${errorMsg}`);
          console.error(`[SFactoryClient] Result completo:`, JSON.stringify(data.result, null, 2));
          
          // Si el error indica token inválido y tenemos reintentos, reautenticar
          if (
            (errorMsg.toLowerCase().includes('token') || 
             errorMsg.toLowerCase().includes('auth') ||
             errorMsg.toLowerCase().includes('session')) &&
            retryCount > 0
          ) {
            console.log('[SFactoryClient] Error de autenticación detectado, esperando 2 segundos antes de reautenticar...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('[SFactoryClient] Invalidando token...');
            await sfactoryAuthService.invalidateToken(key);
            console.log('[SFactoryClient] Reintentando petición...');
            return this.request<T>(module, method, parameters, companyKey, retryCount - 1);
          }
          
          throw new Error(errorMsg);
        }

        // Extraer los datos de response
        if (!data.response) {
          console.error('[SFactoryClient] La respuesta no contiene el campo "response"');
          console.error('[SFactoryClient] Respuesta completa:', JSON.stringify(rawData, null, 2));
          throw new Error('La respuesta de S-Factory no contiene el campo "response"');
        }

        console.log('[SFactoryClient] Petición exitosa');
        return data.response as T;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        const errorMessage = fetchError.message || String(fetchError);
        const errorName = fetchError.name || '';
        
        console.error('[SFactoryClient] Error en fetch:', {
          name: errorName,
          message: errorMessage,
          stack: fetchError.stack,
          cause: fetchError.cause,
        });
        
        // Si fue abortado por timeout
        if (errorName === 'AbortError') {
          throw new Error('Timeout: La petición tardó más de 120 segundos');
        }
        
        // Detectar errores de conexión antes de lanzar
        const isConnectionError = 
          errorMessage.includes('terminated') || 
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('socket hang up') ||
          errorMessage.includes('Connection closed') ||
          (errorName === 'TypeError' && errorMessage === 'terminated');
        
        if (isConnectionError && retryCount > 0) {
          console.log('[SFactoryClient] Error de conexión TLS/SSL detectado');
          console.log('[SFactoryClient] Esperando 3 segundos antes de reautenticar y reintentar...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('[SFactoryClient] Invalidando token...');
          await sfactoryAuthService.invalidateToken(key);
          console.log('[SFactoryClient] Reintentando petición...');
          return this.request<T>(module, method, parameters, companyKey, retryCount - 1);
        }
        
        throw fetchError;
      }

    } catch (error: any) {
      // Capturar errores de conexión específicos
      const errorMessage = error.message || String(error);
      const errorName = error.name || '';
      
      // Detectar diferentes tipos de errores de conexión
      const isConnectionError = 
        errorMessage.includes('terminated') || 
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('Connection closed') ||
        (errorName === 'TypeError' && errorMessage === 'terminated');
      
      if (isConnectionError) {
        console.error(`[SFactoryClient] Error de conexión TLS/SSL en catch externo: ${errorMessage}`);
        console.error(`[SFactoryClient] Error name: ${errorName}`);
        console.error(`[SFactoryClient] Stack:`, error.stack);
        
        // Si tenemos reintentos y es un error de conexión, intentar reautenticar
        if (retryCount > 0) {
          console.log('[SFactoryClient] Error de conexión detectado en catch externo, esperando 3 segundos...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('[SFactoryClient] Invalidando token...');
          await sfactoryAuthService.invalidateToken(key);
          console.log('[SFactoryClient] Reintentando petición...');
          return this.request<T>(module, method, parameters, companyKey, retryCount - 1);
        }
        
        throw new Error(
          `Conexión terminada inesperadamente con SFactory. ` +
          `El servidor cerró la conexión SSL/TLS antes de completarse. ` +
          `Posibles causas: token inválido/expirado, servidor rechazando conexión, ` +
          `problemas de certificado SSL, o el servidor está sobrecargado. ` +
          `Error: ${errorMessage}`
        );
      }
      
      // Re-lanzar otros errores
      throw error;
    }
  }
}

// Singleton
export const sfactoryClient = new SFactoryClient();