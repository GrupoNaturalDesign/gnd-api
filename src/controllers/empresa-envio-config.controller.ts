import type { Response } from 'express';
import { empresaEnvioConfigService } from '../services/empresa-envio-config.service';
import {
  envioConfigPatchSchema,
  envioConfigSyncSchema,
} from '../validation/envio-config.validation';
import type { FirebaseAuthRequest } from '../middleware/firebase-auth.middleware';
import { ShippingValidationError } from '../services/shipping/shipping.errors';

function getEmpresaId(req: FirebaseAuthRequest): number {
  const id = req.empresaId;
  if (id == null) throw new ShippingValidationError('empresaId requerido');
  return id;
}

export async function getEnvioConfig(req: FirebaseAuthRequest, res: Response): Promise<void> {
  try {
    const data = await empresaEnvioConfigService.getEnvioConfig(getEmpresaId(req));
    res.json({ success: true, data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al obtener configuración de envíos';
    res.status(500).json({ success: false, error: message });
  }
}

export async function patchEnvioConfig(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const parsed = envioConfigPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validación fallida',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const data = await empresaEnvioConfigService.patchEnvioConfig(
      getEmpresaId(req),
      parsed.data
    );
    res.json({ success: true, data, message: 'Configuración de envíos actualizada' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al guardar configuración de envíos';
    res.status(e instanceof ShippingValidationError ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
}

export async function syncMicorreoAccount(req: FirebaseAuthRequest, res: Response): Promise<void> {
  const parsed = envioConfigSyncSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validación fallida',
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const data = await empresaEnvioConfigService.syncMicorreo(
      getEmpresaId(req),
      parsed.data.correoAccountPassword
    );
    res.json({ success: true, data, message: 'Cuenta MiCorreo vinculada correctamente' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al vincular MiCorreo';
    res.status(e instanceof ShippingValidationError ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
}

export async function registerMicorreoAccount(
  req: FirebaseAuthRequest,
  res: Response
): Promise<void> {
  try {
    const data = await empresaEnvioConfigService.registerMicorreo(getEmpresaId(req));
    res.json({ success: true, data, message: 'Cuenta MiCorreo registrada correctamente' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error al registrar MiCorreo';
    res.status(e instanceof ShippingValidationError ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
}
