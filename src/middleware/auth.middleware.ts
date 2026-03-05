import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Middleware que valida Bearer token contra la tabla Sesion.
 * Si es válido, setea req.userId, req.userEmail y req.empresaId (desde el usuario).
 * Si no hay token o es inválido, responde 401.
 * Usar en rutas que mutan (POST/PUT/PATCH/DELETE) para auditoría y control de acceso.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Se requiere token Bearer en el header Authorization',
      });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Token vacío',
      });
      return;
    }

    const sesion = await prisma.sesion.findFirst({
      where: { token },
      include: { usuario: true },
    });

    if (!sesion) {
      res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Token inválido o sesión no encontrada',
      });
      return;
    }

    if (sesion.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Sesión expirada',
      });
      return;
    }

    const usuario = sesion.usuario;
    if (!usuario.activo) {
      res.status(401).json({
        success: false,
        error: 'No autorizado',
        message: 'Usuario inactivo',
      });
      return;
    }

    req.userId = usuario.id;
    req.userEmail = usuario.email;
    req.empresaId = usuario.empresaId ?? undefined;
    next();
  } catch (error: unknown) {
    console.error('[auth.middleware] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al validar la sesión',
      message: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
}
