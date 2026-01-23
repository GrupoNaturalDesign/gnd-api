import { Router } from 'express';
import { pedidosController } from '../controllers/pedidos.controller';

const router = Router();

// GET /api/pedidos - Listar pedidos directamente desde SFactory (sin middleware)
router.get('/', pedidosController.listar.bind(pedidosController));

export default router;

