import { Router } from 'express';
import { clientesController } from '../controllers/clientes.controller';
import { empresaMiddleware } from '../middleware/empresa.middleware';
import { firebaseAuthMiddleware } from '../middleware/firebase-auth.middleware';
import { requireAdmin } from '../middleware/require-admin.middleware';

const router = Router();

// Público: listado desde SFactory (sin auth)
router.get('/sfactory', clientesController.listarDesdeSFactory.bind(clientesController));

// Resto: solo admin autenticado
router.use(firebaseAuthMiddleware, requireAdmin, empresaMiddleware);

// GET /api/clientes - Listar todos los clientes desde nuestra BD
router.get('/', clientesController.listar.bind(clientesController));

// GET /api/clientes/:id - Obtener cliente por ID
router.get('/:id', clientesController.getById.bind(clientesController));

// POST /api/clientes - Crear cliente en SFactory y guardar en BD
router.post('/', clientesController.crear.bind(clientesController));

// POST /api/clientes/sync - Sincronizar clientes desde SFactory
router.post('/sync', clientesController.sincronizar.bind(clientesController));

export default router;

