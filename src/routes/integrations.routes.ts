import { Router } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import { getIntegrationsStatus } from '../controllers/integrations.controller';

const router = Router();

router.get(
  '/status',
  firebaseAuthMiddleware,
  requireAdmin,
  getIntegrationsStatus,
);

export default router;
