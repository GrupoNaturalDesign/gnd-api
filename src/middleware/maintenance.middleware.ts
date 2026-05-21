import { Request, Response, NextFunction } from 'express';
import {
  parseMaintenanceMode,
  MaintenanceMode,
  isPublicMaintenanceBlocked,
  isAdminMaintenanceBlocked,
} from '../lib/maintenance-mode';
import {
  isMaintenanceAllowlistedPath,
  isAdminApiPath,
} from '../lib/maintenance-paths';

export type MaintenanceBlockScope = 'public' | 'admin';

export function buildMaintenanceResponse(scope: MaintenanceBlockScope) {
  const isAdmin = scope === 'admin';
  return {
    success: false as const,
    error: 'Servicio en mantenimiento',
    message: isAdmin
      ? 'El panel de administración no está disponible temporalmente.'
      : 'La tienda no está disponible temporalmente. Volvé a intentar en unos minutos.',
    code: 'MAINTENANCE' as const,
    scope,
  };
}

function getActiveMaintenanceMode(): MaintenanceMode {
  return parseMaintenanceMode(process.env.MAINTENANCE_MODE);
}

/** Resuelve si la request debe bloquearse y con qué scope. */
export function resolveMaintenanceBlock(
  path: string,
  method: string,
  mode: MaintenanceMode = getActiveMaintenanceMode()
): MaintenanceBlockScope | null {
  if (mode === MaintenanceMode.Off) {
    return null;
  }
  if (isMaintenanceAllowlistedPath(path, method)) {
    return null;
  }

  if (isAdminApiPath(path, method)) {
    if (isAdminMaintenanceBlocked(mode)) {
      return 'admin';
    }
    return null;
  }

  if (isPublicMaintenanceBlocked(mode)) {
    return 'public';
  }

  return null;
}

export function maintenanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const scope = resolveMaintenanceBlock(req.path, req.method);
  if (scope) {
    res.status(503).json(buildMaintenanceResponse(scope));
    return;
  }
  next();
}
