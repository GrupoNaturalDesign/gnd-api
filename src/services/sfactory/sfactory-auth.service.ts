import prisma from '../../lib/prisma';

interface SFactoryAuthResponse {
  result: {
    success: boolean;
    state: number;
    message: string;
  };
  response: {
    token: string;
    user_id?: number;
    company_id?: number;
  };
}

export class SFactoryAuthService {
  /**
   * Autenticar con SFactory y guardar credenciales en BD
   * Busca la empresa por companyKey y guarda el token y company_id
   */
  async authenticateAndSave(companyKey: string): Promise<{
    empresaId: number;
    token: string;
    companyId?: number;
  }> {
    try {
      // Buscar empresa por companyKey
      // Seleccionar solo campos necesarios para evitar errores si las columnas no existen aún
      const empresa = await prisma.empresa.findFirst({
        where: {
          sfactoryCompanyKey: companyKey,
          activa: true,
        },
        select: {
          id: true,
          nombre: true,
          sfactoryCompanyKey: true,
        },
      });

      if (!empresa) {
        throw new Error(`Empresa no encontrada con companyKey: ${companyKey}`);
      }

      // Hacer login a SFactory
      const body = {
        auth: {
          userdev: process.env.SFACTORY_USERDEV || '',
          password: process.env.SFACTORY_PASSWORD || '',
        },
        service: {
          module: 'Auth',
          method: 'sign_in',
        },
        parameters: {
          user_factory: process.env.SFACTORY_USER_FACTORY || '',
          password_factory: process.env.SFACTORY_PASSWORD_FACTORY || '',
          companyKey: companyKey,
        },
      };

      const baseURL = process.env.SFACTORY_API_URL || '';
      const url = `${baseURL}/sign_in`;
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

      const token = data.response.token;
      const companyId = data.response.company_id;
      const userId = data.response.user_id;

      // Token expira en 30 días según documentación
      const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Guardar token y datos en BD
      try {
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: {
            sfactoryToken: token,
            sfactoryTokenExpiry: tokenExpiry,
            ...(companyId !== undefined && { sfactoryCompanyId: companyId }),
            ...(userId !== undefined && { sfactoryUserId: userId }),
          },
        });
      } catch (error: any) {
        if (error.code === 'P2022') {
          throw new Error(
            'Las columnas de sesión SFactory no existen en la base de datos. ' +
            'Ejecuta el script SQL: add_sfactory_columns.sql o ejecuta: npx prisma db push'
          );
        }
        throw error;
      }

      return {
        empresaId: empresa.id,
        token,
        ...(companyId !== undefined && { companyId }),
      };
    } catch (error: any) {
      console.error('❌ Error en autenticación SFactory:', error.message);
      throw error;
    }
  }

  /**
   * Obtener token válido desde la BD
   * Si no existe o está expirado, autentica automáticamente
   * Este es el método principal para obtener tokens - centraliza toda la lógica de autenticación
   */
  async getToken(companyKey?: string): Promise<string> {
    try {
      const key = companyKey || process.env.SFACTORY_COMPANY_KEY || '';

      if (!key) {
        throw new Error('CompanyKey no proporcionado y no está configurado en variables de entorno');
      }

      // Intentar obtener token de BD
      try {
        const empresa = await prisma.empresa.findFirst({
          where: {
            sfactoryCompanyKey: key,
            activa: true,
          },
          select: {
            id: true,
            sfactoryToken: true,
            sfactoryTokenExpiry: true,
          },
        });

        // Si hay token válido, retornarlo
        if (
          empresa?.sfactoryToken &&
          empresa?.sfactoryTokenExpiry &&
          new Date() < empresa.sfactoryTokenExpiry
        ) {
          return empresa.sfactoryToken;
        }

        // Si no hay token o está expirado, autenticar
        if (empresa) {
          const result = await this.authenticateAndSave(key);
          return result.token;
        }
      } catch (error: any) {
        // Si las columnas no existen (error P2022), autenticar de todas formas
        if (error.code === 'P2022') {
          const result = await this.authenticateAndSave(key);
          return result.token;
        }
        throw error;
      }

      // Si no se encontró empresa, intentar autenticar de todas formas
      // (puede crear/actualizar la empresa)
      const result = await this.authenticateAndSave(key);
      return result.token;
    } catch (error: any) {
      console.error('❌ Error obteniendo token SFactory:', error.message);
      throw error;
    }
  }

  /**
   * Obtener empresaId desde la BD basado en companyKey
   * Si no hay token válido, intenta autenticar
   */
  async getEmpresaId(companyKey?: string): Promise<number | null> {
    try {
      // Si no se proporciona companyKey, usar el de .env
      const key = companyKey || process.env.SFACTORY_COMPANY_KEY || '';

      // Primero obtener solo el ID de la empresa (esto siempre funciona)
      const empresaBasic = await prisma.empresa.findFirst({
        where: {
          sfactoryCompanyKey: key,
          activa: true,
        },
        select: {
          id: true,
        },
      });

      if (!empresaBasic) {
        return null;
      }

      // Intentar verificar si hay token guardado (solo si las columnas existen)
      try {
        const empresaConToken = await prisma.empresa.findFirst({
          where: {
            sfactoryCompanyKey: key,
            activa: true,
          },
          select: {
            id: true,
            sfactoryToken: true,
            sfactoryTokenExpiry: true,
          },
        });

        // Si las columnas existen y hay token válido, retornar el ID
        if (
          empresaConToken?.sfactoryToken &&
          empresaConToken?.sfactoryTokenExpiry &&
          new Date() < empresaConToken.sfactoryTokenExpiry
        ) {
          return empresaConToken.id;
        }

        // Si hay token pero está expirado, o no hay token, autenticar
        if (empresaConToken) {
          await this.authenticateAndSave(key);
          return empresaBasic.id;
        }
      } catch (error: any) {
        // Si las columnas no existen (error P2022), simplemente retornar el ID
        if (error.code === 'P2022') {
          return empresaBasic.id;
        }
        throw error;
      }

      return empresaBasic.id;
    } catch (error: any) {
      return null;
    }
  }
}

export const sfactoryAuthService = new SFactoryAuthService();
