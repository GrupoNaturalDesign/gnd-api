import { Router } from 'express';
import * as newsletterPublicController from '../controllers/newsletter-public.controller';

const router = Router();

router.post('/subscribe', newsletterPublicController.postSubscribe);

export default router;