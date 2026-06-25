// src/routes/checkout.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { checkoutController } from '../controllers/checkout.controller';
import { checkoutShippingController } from '../controllers/checkout-shipping.controller';

const router = Router();

const mpPaymentStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/resultado', (req, res) => {
  checkoutController.resultado(req, res);
});

router.get(
  '/payment-status/:pedidoId',
  mpPaymentStatusLimiter,
  firebaseAuthMiddleware,
  (req, res) => {
    void checkoutController.paymentStatusMp(req, res);
  }
);

router.post('/mp', firebaseAuthMiddleware, (req, res) => {
  void checkoutController.iniciarPagoMp(req, res);
});

router.post('/manual', firebaseAuthMiddleware, (req, res) => {
  void checkoutController.iniciarPagoManual(req, res);
});

router.get('/config-precios', (req, res) => {
  void checkoutController.getPrecioConfigPublic(req, res);
});

router.get('/datos-bancarios', (req, res) => {
  void checkoutController.getDatosBancariosPublic(req, res);
});

router.get('/config-tienda', (req, res) => {
  void checkoutController.getTiendaConfigPublic(req, res);
});

router.get('/pedido/:pedidoId/instrucciones-pago', firebaseAuthMiddleware, (req, res) => {
  void checkoutController.getInstruccionesPago(req, res);
});

router.post('/shipping/quote', firebaseAuthMiddleware, (req, res) => {
  void checkoutShippingController.quote(req, res);
});

router.get('/shipping/agencies', firebaseAuthMiddleware, (req, res) => {
  void checkoutShippingController.agencies(req, res);
});

export default router;
