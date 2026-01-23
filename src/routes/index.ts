import { Router } from 'express';
import rubrosRoutes from './rubros.routes';
import subrubrosRoutes from './subrubros.routes';
import productosRoutes from './productos.routes';
import sfactoryAuthRoutes from './sfactory-auth.routes';
import syncRoutes from './sync.routes';
import clientesRoutes from './clientes.routes';
import pedidosRoutes from './pedidos.routes';
import productImagesRoutes from './productImages.routes';
import productoWebRoutes from './productoWeb.routes';
import productoPrecioRoutes from './productoPrecio.routes';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// SFactory Auth routes (sin middleware de empresa)
router.use('/sfactory/auth', sfactoryAuthRoutes);

// Routes con middleware de empresa (inyecta empresaId automáticamente)
router.use('/rubros', empresaMiddleware, rubrosRoutes);
router.use('/subrubros', empresaMiddleware, subrubrosRoutes);
// Productos: la ruta /activos es pública, el resto requiere middleware
router.use('/productos', productosRoutes); // El middleware se aplica en las rutas específicas que lo necesiten

// Clientes routes (con middleware de empresa)
router.use('/clientes', clientesRoutes);

// Pedidos routes
router.use('/pedidos', pedidosRoutes);

// Product Images (sin middleware de empresa por ahora, puede agregarse si es necesario)
router.use('/product-images', productImagesRoutes);

// ProductoWeb routes (con middleware de empresa)
router.use('/productos-web', productoWebRoutes);

// ProductoPrecio routes
router.use('/productos-precios', productoPrecioRoutes);

// Sync routes (con middleware de empresa)
router.use('/sync', syncRoutes);

export default router;

