import { Router } from 'express';
import { productoController } from '../controllers';
import { empresaMiddleware } from '../middleware/empresa.middleware';
import { uploadDocumentSingle } from '../middleware/upload.middleware';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';

const router = Router();

// ——— Públicos (ecommerce, sin auth) ———
router.get('/activos', productoController.getActivos.bind(productoController));
router.get('/publicados', productoController.getPublicados.bind(productoController));
router.get('/destacados', productoController.getDestacados.bind(productoController));
router.get('/sfactory', productoController.listarDesdeSFactory.bind(productoController));
router.get('/slug/:slug', productoController.getBySlug.bind(productoController));

// ——— Panel admin: Firebase + rol ADMIN + empresa ———
router.use(firebaseAuthMiddleware, requireAdmin, empresaMiddleware);

// Rutas específicas (deben ir ANTES de las genéricas)

// POST /api/productos/validar-codigo - Validar código en BD local
router.post('/validar-codigo', productoController.validarCodigo.bind(productoController));

// GET /api/productos/buscar-padre - Buscar productos padre para crear variantes
router.get('/buscar-padre', productoController.buscarProductosPadre.bind(productoController));

// GET /api/productos/variantes/:codigoBase - Obtener variantes de un código base
router.get('/variantes/:codigoBase', productoController.obtenerVariantesPorCodigoBase.bind(productoController));

// GET /api/productos/:id/completo - Obtener producto completo para edición
router.get('/:id/completo', productoController.obtenerProductoCompleto.bind(productoController));

// GET /api/productos/:id/variantes - Obtener variantes de un producto padre
router.get('/:id/variantes', productoController.getVariantes.bind(productoController));

// GET /api/productos/:productoPadreId/datos-plantilla - Obtener datos plantilla
router.get('/:productoPadreId/datos-plantilla', productoController.obtenerDatosPlantilla.bind(productoController));

// GET /api/productos/:productoPadreId/combinaciones - Obtener combinaciones Talle+Color
router.get('/:productoPadreId/combinaciones', productoController.obtenerCombinaciones.bind(productoController));

// PUT /api/productos/:itemId/sfactory - Actualizar producto en SFactory y sincronizar
router.put('/:itemId/sfactory', productoController.actualizarEnSFactory.bind(productoController));

// PATCH /api/productos/:id/local - Actualizar solo datos locales
router.patch('/:id/local', productoController.actualizarDatosLocales.bind(productoController));

// PATCH /api/productos/:productoWebId/variante - Actualizar datos de variante
router.patch('/:productoWebId/variante', productoController.actualizarDatosVariante.bind(productoController));

// PATCH /api/productos/bulk/publicado - Actualizar publicado en bulk
router.patch('/bulk/publicado', productoController.bulkUpdatePublicado.bind(productoController));

// PATCH /api/productos/bulk/destacado - Actualizar destacado en bulk
router.patch('/bulk/destacado', productoController.bulkUpdateDestacado.bind(productoController));

// PATCH /api/productos/:id/tabla-talles - Subir tabla de talles (imagen o PDF)
router.patch(
  '/:id/tabla-talles',
  uploadDocumentSingle('documento'),
  productoController.uploadTablaTalles.bind(productoController)
);

// DELETE /api/productos/:id/tabla-talles - Eliminar tabla de talles
router.delete(
  '/:id/tabla-talles',
  productoController.deleteTablaTalles.bind(productoController)
);

// PATCH /api/productos/:id/ficha-tecnica - Subir ficha técnica / indicaciones de bordado
router.patch(
  '/:id/ficha-tecnica',
  uploadDocumentSingle('documento'),
  productoController.uploadFichaTecnica.bind(productoController)
);

// DELETE /api/productos/:id/ficha-tecnica - Eliminar ficha técnica
router.delete(
  '/:id/ficha-tecnica',
  productoController.deleteFichaTecnica.bind(productoController)
);

// Rutas genéricas (deben ir DESPUÉS de las específicas)

// POST /api/productos - Crear producto en SFactory y sincronizar
router.post('/', productoController.crear.bind(productoController));

// GET /api/productos
router.get('/', productoController.getAll.bind(productoController));

// PATCH /api/productos/:id
router.patch('/:id', productoController.update.bind(productoController));

// DELETE /api/productos/:id
router.delete('/:id', productoController.delete.bind(productoController));

// GET /api/productos/:id
router.get('/:id', productoController.getById.bind(productoController));

export default router;

