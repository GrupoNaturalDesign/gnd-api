import { Router } from 'express';
import * as portalClientesController from '../controllers/portal-clientes.controller';

const router = Router();

router.get('/sso', portalClientesController.sso);

export default router;
