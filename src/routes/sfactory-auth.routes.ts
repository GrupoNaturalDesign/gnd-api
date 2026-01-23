// src/routes/sfactory-auth.routes.ts
import { Router } from 'express';
import { sfactoryAuthController } from '../controllers/sfactory-auth.controller';

const router = Router();

// POST /api/sfactory/auth/init - Inicializar sesión con SFactory
router.post('/init', sfactoryAuthController.initSession.bind(sfactoryAuthController));

// GET /api/sfactory/auth/status - Obtener estado de sesión
router.get('/status', sfactoryAuthController.getStatus.bind(sfactoryAuthController));

export default router;
