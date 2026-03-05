// src/controllers/sfactory-auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';
import { ApiResponse } from '../types';

export class SFactoryAuthController {
  /**
   * Inicializar sesión con SFactory
   * POST /api/sfactory/auth/init
   * Body: { companyKey?: string } (opcional, usa el de .env si no se proporciona)
   */
  async initSession(req: Request, res: Response, next: NextFunction) {
    try {
      // companyKey solo desde env del backend (no viaja en el cliente por seguridad)
      const companyKey = process.env.SFACTORY_COMPANY_KEY || '';

      if (!companyKey) {
        return res.status(400).json({
          success: false,
          error: 'CompanyKey requerido',
          message: 'SFACTORY_COMPANY_KEY debe estar configurado en variables de entorno del servidor.',
        });
      }

      const result = await sfactoryAuthService.authenticateAndSave(companyKey);

      const response: ApiResponse = {
        success: true,
        data: {
          empresaId: result.empresaId,
          companyId: result.companyId,
          message: 'Sesión de SFactory inicializada correctamente',
        },
        message: 'Autenticación exitosa',
      };

      res.json(response);
    } catch (error: any) {
      console.error('[SFactoryAuthController.initSession] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al inicializar sesión con SFactory',
        message: error.message,
      });
    }
  }

  /**
   * Obtener información de la sesión actual
   * GET /api/sfactory/auth/status
   */
  async getStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = await sfactoryAuthService.getEmpresaId();

      if (!empresaId) {
        return res.status(404).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se encontró una sesión activa. Inicializa la sesión primero.',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: {
          empresaId,
          message: 'Sesión activa',
        },
      };

      res.json(response);
    } catch (error: any) {
      console.error('[SFactoryAuthController.getStatus] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estado de sesión',
        message: error.message,
      });
    }
  }
}

export const sfactoryAuthController = new SFactoryAuthController();
