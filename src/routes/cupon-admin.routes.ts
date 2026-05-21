import { Router } from 'express';
import { CuponAdminController } from '../controllers/cupon-admin.controller';

const router = Router();
const controller = new CuponAdminController();

router.get('/', controller.listar.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/', controller.crear.bind(controller));
router.put('/:id', controller.actualizar.bind(controller));
router.patch('/:id', controller.actualizar.bind(controller));
router.delete('/:id', controller.eliminar.bind(controller));

router.post('/:id/pausar', async (req, res) => {
  const empresaId = (req as any).empresaId;
  const { id } = req.params;
  if (!empresaId || !id) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros' });
  }
  const { Prisma } = await import('@prisma/client');
  const prisma = (await import('../lib/prisma')).default;
  await prisma.cupon.update({
    where: { id: parseInt(id, 10), empresaId },
    data: { estado: 'pausado' },
  });
  res.json({ success: true, message: 'Cupón pausado' });
});

router.post('/:id/activar', async (req, res) => {
  const empresaId = (req as any).empresaId;
  const { id } = req.params;
  if (!empresaId || !id) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros' });
  }
  const prisma = (await import('../lib/prisma')).default;
  await prisma.cupon.update({
    where: { id: parseInt(id, 10), empresaId },
    data: { estado: 'activo' },
  });
  res.json({ success: true, message: 'Cupón activado' });
});

export default router;