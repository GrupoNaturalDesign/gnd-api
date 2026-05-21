import { Router } from 'express';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import { shippingEmpresaMiddleware } from '../middleware/shipping-empresa.middleware';
import { shippingController } from '../controllers/shipping.controller';

const router = Router();

router.use(firebaseAuthMiddleware);
// router.use(requireAdmin);
router.use(shippingEmpresaMiddleware);

router.post('/quote', (req, res) => {
  void shippingController.quote(req, res);
});
router.get('/orders/:pedidoId/label', (req, res) => {
  void shippingController.getOrderLabel(req, res);
});
router.get('/orders/:pedidoId/tracking', (req, res) => {
  void shippingController.getOrderTracking(req, res);
});
router.post('/orders', (req, res) => {
  void shippingController.createOrder(req, res);
});
router.get('/agencies', (req, res) => {
  void shippingController.getAgencies(req, res);
});

export default router;
