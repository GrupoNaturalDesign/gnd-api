import { Router } from 'express';
import { cuentaPedidosController } from '../controllers/cuenta-pedidos.controller';

const router = Router();

router.get('/pedidos', cuentaPedidosController.listar.bind(cuentaPedidosController));
router.get('/pedidos/:id', cuentaPedidosController.detalle.bind(cuentaPedidosController));

export default router;
