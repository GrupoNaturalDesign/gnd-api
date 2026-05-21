import type { Socket } from 'socket.io';
import { verifyIdToken } from '../lib/firebase-admin';
import { firebaseAuthService } from '../services/firebase-auth.service';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';

type NextFn = (err?: Error) => void;

function extractToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

export async function authenticateAdminSocket(socket: Socket, next: NextFn): Promise<void> {
  try {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('Token de autenticación requerido.'));
      return;
    }

    const decoded = await verifyIdToken(token);
    const session = await firebaseAuthService.getSessionByUid(decoded.uid);
    if (!session || session.role !== 'ADMIN') {
      next(new Error('Acceso denegado. Se requiere rol admin.'));
      return;
    }

    const empresaId = await sfactoryAuthService.getEmpresaId();
    if (!empresaId) {
      next(new Error('No se pudo resolver empresaId.'));
      return;
    }

    socket.data.uid = decoded.uid;
    socket.data.empresaId = empresaId;
    socket.data.role = session.role;
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error('Socket auth inválida.'));
  }
}
