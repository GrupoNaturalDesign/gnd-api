import { Router } from 'express';
import { productoPrecioController } from '../controllers/productoPrecio.controller';
// import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Cuando auth esté listo: router.use(requireAuth);

router.post('/', productoPrecioController.upsert.bind(productoPrecioController));
router.patch('/:id', productoPrecioController.update.bind(productoPrecioController));
router.get('/producto-web/:productoWebId', productoPrecioController.getByProductoWebId.bind(productoPrecioController));
router.get('/producto-web/:productoWebId/tipo/:tipoCliente', productoPrecioController.getByProductoWebIdAndTipo.bind(productoPrecioController));
router.delete('/:id', productoPrecioController.delete.bind(productoPrecioController));

export default router;

