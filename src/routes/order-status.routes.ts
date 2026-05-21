import { Router } from 'express';
import * as erpOrderStatusController from '../controllers/erp-order-status.controller';

const router = Router();

router.post('/status', erpOrderStatusController.postOrderStatusFromErp);

export default router;
