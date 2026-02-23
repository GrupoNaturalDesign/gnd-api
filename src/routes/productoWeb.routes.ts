import { Router } from 'express';
import { productoWebController } from '../controllers/productoWeb.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';
// import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Rutas con empresa. Cuando auth esté listo: router.use(empresaMiddleware, requireAuth);
router.use(empresaMiddleware);

// PATCH /api/productos-web/bulk
router.patch('/bulk', productoWebController.updateBulk.bind(productoWebController));

// GET /api/productos-web/:id
router.get('/:id', productoWebController.getById.bind(productoWebController));

// PATCH /api/productos-web/:id
router.patch('/:id', productoWebController.update.bind(productoWebController));

export default router;

