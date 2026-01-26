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

