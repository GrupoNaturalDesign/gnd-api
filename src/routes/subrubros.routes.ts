import { Router } from 'express';
import { subrubroController } from '../controllers';

const router = Router();

// GET /api/subrubros
router.get('/', subrubroController.getAll.bind(subrubroController));

// GET /api/subrubros/slug/:slug (debe ir antes de /:id para evitar conflictos)
router.get('/slug/:slug', subrubroController.getBySlug.bind(subrubroController));

// GET /api/subrubros/:id
router.get('/:id', subrubroController.getById.bind(subrubroController));

export default router;

