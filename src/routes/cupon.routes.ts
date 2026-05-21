import { Router } from 'express';
import { CuponController } from '../controllers/cupon.controller';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';

const router = Router();
const cuponController = new CuponController();

router.post('/validar', firebaseAuthMiddleware, (req, res, next) => {
  void cuponController.validar(req, res, next);
});

export default router;
