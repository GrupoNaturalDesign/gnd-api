import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
// import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Auth desactivado hasta terminar implementación. Cuando esté listo:
// 1. Descomentar: router.use(requireAuth);
// 2. En index.ts decidir si audit-logs usa solo requireAuth (empresaId del usuario) o empresaMiddleware + requireAuth
// router.use(requireAuth);

// GET /api/audit-logs - Listar logs con paginación y filtros
router.get('/', auditController.list.bind(auditController));

export default router;
