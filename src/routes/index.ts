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
import sfactoryVentasRoutes from './sfactory-ventas.routes';
import pedidoAdminRoutes from './pedido-admin.routes';
import shippingRoutes from './shipping.routes';
import correoTestRoutes from './correo.test.routes';
import checkoutRoutes from './checkout.routes';
import cuentaRoutes from './cuenta.routes';
import webhookMpRoutes from './webhook-mp.routes';
import emailPublicRoutes from './email-public.routes';
import orderStatusRoutes from './order-status.routes';
import newsletterAdminRoutes from './newsletter-admin.routes';
import newsletterPublicRoutes from './newsletter-public.routes';
import * as newsletterAdminController from '../controllers/newsletter-admin.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';
import usuarioAdminRoutes from './usuario-admin.routes';

const router = Router();

function createLimiter(name: string, windowMs: number, max: number, error: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn('[rate-limit]', {
        limiter: name,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
      res.status(429).json({ success: false, error });
    },
  });
}

// Rate limiters: protegen endpoints publicos, auth e integraciones de abuso/DoS
const authLimiter = createLimiter(
  'auth',
  15 * 60 * 1000,
  60,
  'Demasiadas solicitudes de autenticacion. Intente mas tarde.'
);
const publicEmailLimiter = createLimiter(
  'public-email',
  15 * 60 * 1000,
  20,
  'Demasiadas solicitudes de email. Intente mas tarde.'
);
const newsletterLimiter = createLimiter(
  'newsletter',
  15 * 60 * 1000,
  20,
  'Demasiadas solicitudes de newsletter. Intente mas tarde.'
);
const checkoutLimiter = createLimiter(
  'checkout',
  15 * 60 * 1000,
  40,
  'Demasiadas solicitudes de checkout. Intente mas tarde.'
);
const webhookLimiter = createLimiter(
  'mercadopago-webhook',
  60 * 1000,
  300,
  'Demasiadas solicitudes de webhook.'
);
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
const sfactoryVentasLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Demasiadas solicitudes a ventas SFactory. Intente más tarde.',
  },
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
router.use('/auth', authLimiter, authRoutes);

// SFactory Auth routes (rate limited, companyKey solo desde env)
router.use('/sfactory/auth', sfactoryAuthLimiter, sfactoryAuthRoutes);

// Rubros y subrubros: públicos (ecommerce), solo inyectan empresa desde config
router.use('/rubros', empresaMiddleware, rubrosRoutes);
router.use('/subrubros', empresaMiddleware, subrubrosRoutes);
router.use('/productos', productosRoutes); // Públicas arriba; admin en el propio router

router.use('/clientes', clientesRoutes); // Públicas arriba; admin en el propio router

router.use('/pedidos', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, pedidosRoutes);
router.use(
  '/admin/pedidos',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  pedidoAdminRoutes
);

router.use('/product-images', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, productImagesRoutes);
router.use('/productos-web', firebaseAuthMiddleware, requireAdmin, productoWebRoutes);
router.use('/productos-precios', firebaseAuthMiddleware, requireAdmin, productoPrecioRoutes);
router.use('/sync', syncLimiter, firebaseAuthMiddleware, requireAdmin, syncRoutes);
router.use(
  '/sfactory/ventas',
  sfactoryVentasLimiter,
  firebaseAuthMiddleware,
  requireAdmin,
  sfactoryVentasRoutes
);
router.use('/audit-logs', firebaseAuthMiddleware, requireAdmin, empresaMiddleware, auditRoutes);

router.use('/shipping/correo/test', correoTestRoutes);
router.use('/shipping', shippingRoutes);

router.use('/checkout', checkoutLimiter, checkoutRoutes);
router.use('/cuenta', firebaseAuthMiddleware, cuentaRoutes);
router.use('/webhooks/mercadopago', webhookLimiter, webhookMpRoutes);

router.use('/emails', publicEmailLimiter, emailPublicRoutes);
router.use('/orders', orderStatusRoutes);
router.use(
  '/admin/newsletter',
  firebaseAuthMiddleware,
  requireAdmin,
  newsletterAdminRoutes
);
router.get(
  '/admin/email-logs',
  firebaseAuthMiddleware,
  requireAdmin,
  newsletterAdminController.getEmailLogs
);

router.use('/newsletter', newsletterLimiter, newsletterPublicRoutes);

import empresaAdminRoutes from './empresa.routes';
import dashboardAdminRoutes from './dashboard-admin.routes';
import adminNotificationsRoutes from './admin-notifications.routes';
import adminSearchRoutes from './admin-search.routes';

router.use(
  '/admin/usuarios',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  usuarioAdminRoutes
);

router.use(
  '/admin/empresa',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  empresaAdminRoutes
);

router.use(
  '/admin/dashboard',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  dashboardAdminRoutes
);

router.use(
  '/admin/notifications',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  adminNotificationsRoutes
);

router.use(
  '/admin/search',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  adminSearchRoutes
);

import cuponAdminRoutes from './cupon-admin.routes';
import cuponRoutes from './cupon.routes';
import integrationsRoutes from './integrations.routes';

router.use('/cupones', empresaMiddleware, cuponRoutes);

router.use(
  '/admin/cupones',
  firebaseAuthMiddleware,
  requireAdmin,
  empresaMiddleware,
  cuponAdminRoutes
);

router.use(
  '/admin/integrations',
  firebaseAuthMiddleware,
  requireAdmin,
  integrationsRoutes
);

export default router;
