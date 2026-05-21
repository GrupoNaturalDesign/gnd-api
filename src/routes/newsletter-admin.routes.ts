import { Router } from 'express';
import * as newsletterAdminController from '../controllers/newsletter-admin.controller';

const router = Router();

router.post('/send', newsletterAdminController.postNewsletterSend);
router.get('/subscribers', newsletterAdminController.getSubscribers);
router.get('/email-logs', newsletterAdminController.getEmailLogs);

export default router;
