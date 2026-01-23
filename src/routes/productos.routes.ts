import { Router } from 'express';
import { productoController } from '../controllers';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();

// GET /api/productos/activos - Endpoint público para ecommerce (sin middleware de empresa)
// El cliente debe enviar empresaId en query params
router.get('/activos', productoController.getActivos.bind(productoController));

// GET /api/productos/publicados - Endpoint público optimizado para ecommerce
router.get('/publicados', productoController.getPublicados.bind(productoController));

// GET /api/productos/destacados - Endpoint público para productos destacados
router.get('/destacados', productoController.getDestacados.bind(productoController));

// GET /api/productos/sfactory - Listar productos directamente desde SFactory (sin middleware)
// Debe ir ANTES de las rutas con middleware para evitar conflictos
router.get('/sfactory', productoController.listarDesdeSFactory.bind(productoController));

// GET /api/productos/slug/:slug - Endpoint público para obtener producto por slug (sin middleware)
// Debe ir ANTES de las rutas con middleware para evitar conflictos
router.get('/slug/:slug', productoController.getBySlug.bind(productoController));

// Rutas protegidas con middleware de empresa
router.use(empresaMiddleware);

// GET /api/productos
router.get('/', productoController.getAll.bind(productoController));

// GET /api/productos/:id/variantes (debe ir antes de /:id)
router.get('/:id/variantes', productoController.getVariantes.bind(productoController));

// PATCH /api/productos/:id
router.patch('/:id', productoController.update.bind(productoController));

// DELETE /api/productos/:id
router.delete('/:id', productoController.delete.bind(productoController));

// GET /api/productos/:id
router.get('/:id', productoController.getById.bind(productoController));

export default router;

