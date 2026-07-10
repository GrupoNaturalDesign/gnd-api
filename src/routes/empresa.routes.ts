import { Router } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import { empresaMiddleware } from '../middleware/empresa.middleware';
import { empresaConfigService } from '../services/empresa-config.service';
import { empresaDatosBancariosService } from '../services/empresa-datos-bancarios.service';
import { empresaTiendaConfigService } from '../services/empresa-tienda-config.service';
import { datosBancariosBodySchema } from '../validation/datos-bancarios.validation';
import { tiendaConfigBodySchema } from '../validation/tienda-config.validation';
import {
  getEnvioConfig,
  getMicorreoHealth,
  patchEnvioConfig,
  registerMicorreoAccount,
  syncMicorreoAccount,
} from '../controllers/empresa-envio-config.controller';

const router = Router();

// Aplicar middleware a todas las rutas
router.use(firebaseAuthMiddleware, requireAdmin, empresaMiddleware);

// GET /api/admin/empresa/config-precios - Obtener config de precios
router.get('/config-precios', async (req, res) => {
  try {
    const empresaId = (req as any).empresaId;
    const config = await empresaConfigService.getPrecioConfig(empresaId);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/admin/empresa/config-precios - Actualizar config de precios
router.patch('/config-precios', async (req, res) => {
  try {
    const empresaId = (req as any).empresaId;
    const input = req.body;
    
    const validFields = ['descuentoTransferencia', 'iva', 'cuotasFinanciado'];
    const filteredInput: any = {};
    
    for (const field of validFields) {
      if (input[field] !== undefined) {
        filteredInput[field] = input[field];
      }
    }
    
    const config = await empresaConfigService.updatePrecioConfig(empresaId, filteredInput);
    res.json({ success: true, data: config, message: 'Configuración actualizada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/empresa/config-precios/recalcular - Recalcular todos los precios
router.post('/config-precios/recalcular', async (req, res) => {
  try {
    const empresaId = (req as any).empresaId;
    const result = await empresaConfigService.recalcularTodosLosPrecios(empresaId);
    res.json({ success: true, data: result, message: `Se recalcularon ${result.actualizados} precios` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/empresa/datos-bancarios
router.get('/datos-bancarios', async (req, res) => {
  try {
    const empresaId = (req as { empresaId?: number }).empresaId;
    const data = await empresaDatosBancariosService.getDatosBancarios(empresaId!);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al obtener datos bancarios';
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /api/admin/empresa/datos-bancarios
router.patch('/datos-bancarios', async (req, res) => {
  try {
    const empresaId = (req as { empresaId?: number }).empresaId;
    const parsed = datosBancariosBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Validación fallida',
        details: parsed.error.flatten(),
      });
      return;
    }
    const data = await empresaDatosBancariosService.upsertDatosBancarios(
      empresaId!,
      parsed.data
    );
    res.json({ success: true, data, message: 'Datos bancarios actualizados' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al guardar datos bancarios';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/admin/empresa/tienda-config
router.get('/tienda-config', async (req, res) => {
  try {
    const empresaId = (req as { empresaId?: number }).empresaId;
    const data = await empresaTiendaConfigService.getTiendaConfig(empresaId!);
    res.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al obtener configuración de tienda';
    res.status(500).json({ success: false, error: message });
  }
});

// PATCH /api/admin/empresa/tienda-config
router.patch('/tienda-config', async (req, res) => {
  try {
    const empresaId = (req as { empresaId?: number }).empresaId;
    const parsed = tiendaConfigBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Validación fallida',
        details: parsed.error.flatten(),
      });
      return;
    }
    const data = await empresaTiendaConfigService.upsertTiendaConfig(empresaId!, parsed.data);
    res.json({ success: true, data, message: 'Configuración de tienda actualizada' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al guardar configuración de tienda';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/admin/empresa/envio-config
router.get('/envio-config', (req, res) => {
  void getEnvioConfig(req as import('../middleware/firebase-auth.middleware').FirebaseAuthRequest, res);
});

// PATCH /api/admin/empresa/envio-config
router.patch('/envio-config', (req, res) => {
  void patchEnvioConfig(req as import('../middleware/firebase-auth.middleware').FirebaseAuthRequest, res);
});

// POST /api/admin/empresa/envio-config/micorreo/sync
router.post('/envio-config/micorreo/sync', (req, res) => {
  void syncMicorreoAccount(req as import('../middleware/firebase-auth.middleware').FirebaseAuthRequest, res);
});

// POST /api/admin/empresa/envio-config/micorreo/register
router.post('/envio-config/micorreo/register', (req, res) => {
  void registerMicorreoAccount(req as import('../middleware/firebase-auth.middleware').FirebaseAuthRequest, res);
});

// GET /api/admin/empresa/envio-config/micorreo/health
router.get('/envio-config/micorreo/health', (req, res) => {
  void getMicorreoHealth(req as import('../middleware/firebase-auth.middleware').FirebaseAuthRequest, res);
});

export default router;