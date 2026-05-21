import { Router } from 'express';
import { usuarioAdminController } from '../controllers/usuario-admin.controller';

const router = Router();

router.get(
  '/',
  usuarioAdminController.listar.bind(usuarioAdminController)
);
router.get(
  '/empresas',
  usuarioAdminController.listarEmpresas.bind(usuarioAdminController)
);
router.get(
  '/:id',
  usuarioAdminController.detalle.bind(usuarioAdminController)
);
router.post(
  '/',
  usuarioAdminController.crear.bind(usuarioAdminController)
);
router.patch(
  '/:id',
  usuarioAdminController.actualizar.bind(usuarioAdminController)
);
router.post(
  '/:id/desactivar',
  usuarioAdminController.desactivar.bind(usuarioAdminController)
);
router.post(
  '/:id/habilitar',
  usuarioAdminController.habilitar.bind(usuarioAdminController)
);
router.delete(
  '/:id',
  usuarioAdminController.eliminar.bind(usuarioAdminController)
);

export default router;