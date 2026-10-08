import { Response } from 'express';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import { generarLinkPortalClientes, PortalClientesError } from '../services/portal-clientes.service';

/**
 * GET /api/portal-clientes/sso
 * Requiere Bearer token. Devuelve la URL del portal con el JWT de AutoLogin (vence en 3 min).
 */
export async function sso(req: FirebaseAuthRequest, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const uid = req.uid;
  if (!uid) {
    res.status(401).json({ success: false, error: 'No autenticado.' });
    return;
  }
  try {
    const link = await generarLinkPortalClientes(uid);
    res.status(200).json({ success: true, data: link });
  } catch (e: unknown) {
    if (e instanceof PortalClientesError) {
      res.status(e.status).json({ success: false, error: e.message, code: e.code });
      return;
    }
    console.error('[portal-clientes/sso]', e);
    res.status(500).json({ success: false, error: 'Error al generar el acceso al Portal Clientes.' });
  }
}
