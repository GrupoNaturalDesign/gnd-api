import { Response, NextFunction } from 'express';
import { FirebaseAuthRequest } from './firebase-auth.middleware';
import { firebaseAuthService } from '../services/firebase-auth.service';

/**
 * Exige que el usuario autenticado tenga rol ADMIN.
 * Debe usarse después de firebaseAuthMiddleware (req.uid ya establecido).
 */
export async function requireAdmin(
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: 'No autenticado.' });
    return;
  }
  try {
    const session = await firebaseAuthService.getSessionByUid(uid);
    if (!session || session.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Acceso denegado. Se requiere rol de administrador.' });
      return;
    }
    next();
  } catch (err) {
    console.error('[requireAdmin]', err);
    res.status(500).json({ success: false, error: 'Error al verificar permisos.' });
  }
}
