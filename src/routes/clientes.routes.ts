import { Router } from 'express';
import { clientesController } from '../controllers/clientes.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';

const router = Router();

// GET /api/clientes/sfactory - Listar clientes directamente desde SFactory (sin middleware)
// Debe ir ANTES de las rutas con middleware para evitar conflictos
router.get('/sfactory', clientesController.listarDesdeSFactory.bind(clientesController));

// Aplicar middleware de empresa al resto de las rutas
router.use(empresaMiddleware);

// GET /api/clientes - Listar todos los clientes desde nuestra BD
router.get('/', clientesController.listar.bind(clientesController));

// GET /api/clientes/:id - Obtener cliente por ID
router.get('/:id', clientesController.getById.bind(clientesController));

// POST /api/clientes - Crear cliente en SFactory y guardar en BD
router.post('/', clientesController.crear.bind(clientesController));

// POST /api/clientes/sync - Sincronizar clientes desde SFactory
router.post('/sync', clientesController.sincronizar.bind(clientesController));

export default router;

