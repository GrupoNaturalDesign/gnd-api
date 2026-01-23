// src/middleware/empresa.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';

/**
 * Middleware para inyectar empresaId automáticamente en las requests
 * Obtiene el empresaId de la BD basado en el companyKey de SFactory
 * Falla si no se puede obtener el empresaId (no usa valores por defecto)
 */
export async function empresaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Obtener empresaId desde la BD basado en SFACTORY_COMPANY_KEY
    const empresaId = await sfactoryAuthService.getEmpresaId();

    if (!empresaId) {
      return res.status(400).json({
        success: false,
        error: 'Empresa no encontrada',
        message: 'No se pudo obtener el empresaId. Verifica que SFACTORY_COMPANY_KEY esté configurado correctamente en las variables de entorno y que la empresa exista en la base de datos.',
      });
    }

    (req as any).empresaId = empresaId;
    next();
  } catch (error: any) {
    console.error('[empresaMiddleware] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener información de la empresa',
      message: error.message,
    });
  }
}
