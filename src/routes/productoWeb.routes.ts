import { Router } from 'express';
import { productoWebController } from '../controllers/productoWeb.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();

router.use(empresaMiddleware);

// PATCH /api/productos-web/bulk
router.patch('/bulk', productoWebController.updateBulk.bind(productoWebController));

// GET /api/productos-web/:id
router.get('/:id', productoWebController.getById.bind(productoWebController));

// PATCH /api/productos-web/:id
router.patch('/:id', productoWebController.update.bind(productoWebController));

export default router;

