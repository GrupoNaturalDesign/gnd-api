import { Router } from 'express';
import * as portalClientesController from '../controllers/portal-clientes.controller';
import * as identidad from '../controllers/portal-identidad.controller';

const router = Router();

router.get('/sso', portalClientesController.sso);
router.get('/identidad', identidad.estado);
router.post('/identidad', identidad.solicitar);

export default router;
