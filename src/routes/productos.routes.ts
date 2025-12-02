import { Router } from 'express';
import { productoController } from '../controllers';

const router = Router();

// GET /api/productos
router.get('/', productoController.getAll.bind(productoController));

// GET /api/productos/slug/:slug (debe ir antes de /:id para evitar conflictos)
router.get('/slug/:slug', productoController.getBySlug.bind(productoController));

// GET /api/productos/:id/variantes (debe ir antes de /:id)
router.get('/:id/variantes', productoController.getVariantes.bind(productoController));

// GET /api/productos/:id
router.get('/:id', productoController.getById.bind(productoController));

export default router;

