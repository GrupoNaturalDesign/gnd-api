import { Request, Response, NextFunction } from 'express';
import { logAuditFromRequest } from '../services/audit.service';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Middleware global de auditoría.
 * Para cada request con método POST, PUT, PATCH o DELETE, registra un log
 * al finalizar la respuesta (res.on('finish')), sin bloquear ni modificar la respuesta.
 * Infiere entidad desde el path y acción desde el método.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.includes(method)) {
    next();
    return;
  }

  res.on('finish', () => {
    // Solo auditar respuestas 2xx/3xx si se desea; aquí auditamos todas las mutaciones
    logAuditFromRequest(req).catch((err) => {
      console.error('[audit.middleware] Error al registrar auditoría:', err);
    });
  });

  next();
}
