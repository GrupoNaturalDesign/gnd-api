import { Router } from 'express';
import { sfactoryVentasController } from '../controllers/sfactory-ventas.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();
router.use(empresaMiddleware);

router.post(
  '/pedido-externo',
  sfactoryVentasController.crearPedidoExterno.bind(sfactoryVentasController)
);
router.post('/ordenes-pedido/listar', sfactoryVentasController.listar.bind(sfactoryVentasController));
router.post('/ordenes-pedido', sfactoryVentasController.crear.bind(sfactoryVentasController));
router.put('/ordenes-pedido', sfactoryVentasController.editar.bind(sfactoryVentasController));
router.get('/ordenes-pedido/:orderId', sfactoryVentasController.leer.bind(sfactoryVentasController));

export default router;
