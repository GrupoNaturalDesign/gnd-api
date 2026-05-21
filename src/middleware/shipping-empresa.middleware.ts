import { Response, NextFunction } from 'express';
import { FirebaseAuthRequest } from './firebase-auth.middleware';
import { firebaseAuthService } from '../services/firebase-auth.service';

/**
 * Tras Firebase: exige usuario con `empresaId` y lo asigna a `req.empresaId`.
 */
export async function shippingEmpresaMiddleware(
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
    if (!session || session.empresaId == null) {
      res.status(403).json({
        success: false,
        error:
          'Se requiere usuario interno asociado a una empresa para operaciones de envío.',
      });
      return;
    }
    req.empresaId = session.empresaId;
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Error al resolver la sesión.' });
  }
}
