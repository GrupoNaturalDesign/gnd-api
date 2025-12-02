import { Router } from 'express';
import { rubroController } from '../controllers';

const router = Router();

// GET /api/rubros
router.get('/', rubroController.getAll.bind(rubroController));

// GET /api/rubros/slug/:slug (debe ir antes de /:id para evitar conflictos)
router.get('/slug/:slug', rubroController.getBySlug.bind(rubroController));

// GET /api/rubros/:id
router.get('/:id', rubroController.getById.bind(rubroController));

export default router;

