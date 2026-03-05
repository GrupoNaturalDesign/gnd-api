import { Router } from 'express';
import * as firebaseAuthController from '../controllers/firebase-auth.controller';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';

const router = Router();

router.post('/register', firebaseAuthController.register);
router.post('/session', firebaseAuthController.session);
router.get('/me', firebaseAuthMiddleware, firebaseAuthController.me);
router.post('/onboarding', firebaseAuthMiddleware, firebaseAuthController.onboarding);

export default router;
