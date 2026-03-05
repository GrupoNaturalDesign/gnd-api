import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { syncController } from '../controllers/sync.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();

/** Límite estricto solo para sync de productos: 5 por 15 min (operación muy costosa) */
const syncProductosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas sincronizaciones de productos. Espere 15 minutos.',
  },
});

router.use(empresaMiddleware);

// Sincronizar rubros
router.post('/rubros', syncController.syncRubros.bind(syncController));

// Sincronizar subrubros
router.post('/subrubros', syncController.syncSubrubros.bind(syncController));

// Sincronizar productos (rate limit estricto + lock/cooldown en controller)
router.post('/productos', syncProductosLimiter, syncController.syncProductos.bind(syncController));

// Sincronizar todo (syncAll también usa lock/cooldown para la parte de productos)
router.post('/all', syncProductosLimiter, syncController.syncAll.bind(syncController));

export default router;
