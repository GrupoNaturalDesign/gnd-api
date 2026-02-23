import { Router } from 'express';
import { syncController } from '../controllers/sync.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';
// import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Sincronización. Cuando auth esté listo: router.use(empresaMiddleware, requireAuth);
router.use(empresaMiddleware);

// Sincronizar rubros
router.post('/rubros', syncController.syncRubros.bind(syncController));

// Sincronizar subrubros
router.post('/subrubros', syncController.syncSubrubros.bind(syncController));

// Sincronizar productos
router.post('/productos', syncController.syncProductos.bind(syncController));

// Sincronizar todo
router.post('/all', syncController.syncAll.bind(syncController));

export default router;
