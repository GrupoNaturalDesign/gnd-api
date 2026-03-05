import { Request, Response, NextFunction } from 'express';
import { verifyIdToken } from '../lib/firebase-admin';

export interface FirebaseAuthRequest extends Request {
  uid?: string;
  idToken?: string;
}

export function firebaseAuthMiddleware(req: FirebaseAuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ success: false, error: 'Token de autenticación requerido.' });
    return;
  }
  verifyIdToken(token)
    .then((decoded) => {
      req.uid = decoded.uid;
      req.idToken = token;
      next();
    })
    .catch(() => {
      res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
    });
}
