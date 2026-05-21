import { Router } from 'express';
import * as publicEmailController from '../controllers/public-email.controller';
import * as unsubscribeController from '../controllers/unsubscribe.controller';

const router = Router();

router.post('/contact', publicEmailController.postContact);
router.post('/order-confirmation', publicEmailController.postOrderConfirmation);
router.get('/unsubscribe/:token', unsubscribeController.getUnsubscribe);

export default router;
