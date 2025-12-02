import { Router } from 'express';
import rubrosRoutes from './rubros.routes';
import subrubrosRoutes from './subrubros.routes';
import productosRoutes from './productos.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
router.use('/rubros', rubrosRoutes);
router.use('/subrubros', subrubrosRoutes);
router.use('/productos', productosRoutes);

export default router;

