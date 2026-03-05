import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
import auditRoutes from './audit.routes';
import authRoutes from './auth.routes';
import { empresaMiddleware } from '../middleware/empresa.middleware';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';

const router = Router();

// Rate limiters: protegen auth y sync de abuso/DoS
const sfactoryAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes de autenticación. Intente más tarde.' },
});
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes de sincronización. Intente más tarde.' },
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Auth routes (register, login/credentials, forgot-password, reset-password, verify-email)
router.use('/auth', authRoutes);

// SFactory Auth routes (rate limited, companyKey solo desde env)
router.use('/sfactory/auth', sfactoryAuthLimiter, sfactoryAuthRoutes);

// Rutas de panel admin: requieren Firebase + rol ADMIN + empresa
router.use('/rubros', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, rubrosRoutes);
router.use('/subrubros', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, subrubrosRoutes);
router.use('/productos', productosRoutes); // Públicas arriba; admin en el propio router

router.use('/clientes', clientesRoutes); // Públicas arriba; admin en el propio router

router.use('/pedidos', firebaseAuthMiddleware, requireAdmin, pedidosRoutes);

router.use('/product-images', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, productImagesRoutes);
router.use('/productos-web', firebaseAuthMiddleware, requireAdmin, productoWebRoutes);
router.use('/productos-precios', firebaseAuthMiddleware, requireAdmin, productoPrecioRoutes);
router.use('/sync', syncLimiter, firebaseAuthMiddleware, requireAdmin, syncRoutes);
router.use('/audit-logs', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, auditRoutes);

export default router;

