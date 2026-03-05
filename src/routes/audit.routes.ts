import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';

const router = Router();

// GET /api/audit-logs - Listar logs con paginación y filtros (auth + ADMIN en index)
router.get('/', auditController.list.bind(auditController));

export default router;
