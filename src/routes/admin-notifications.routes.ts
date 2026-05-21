import { Router } from 'express';
import { adminNotificationsController } from '../controllers/admin-notifications.controller';

const router = Router();

router.get('/', adminNotificationsController.list.bind(adminNotificationsController));
router.get('/unread-count', adminNotificationsController.unreadCount.bind(adminNotificationsController));
router.patch('/:id/read', adminNotificationsController.markRead.bind(adminNotificationsController));
router.patch('/read-all', adminNotificationsController.markAllRead.bind(adminNotificationsController));

export default router;
