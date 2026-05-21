import { Router } from 'express';
import { adminSearchController } from '../controllers/admin-search.controller';

const router = Router();

router.get('/', adminSearchController.search.bind(adminSearchController));

export default router;
