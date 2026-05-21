import { Router } from 'express';
import { dashboardAdminController } from '../controllers/dashboard-admin.controller';

const router = Router();

router.get('/', dashboardAdminController.full.bind(dashboardAdminController));
router.get('/kpis', dashboardAdminController.kpis.bind(dashboardAdminController));
router.get('/serie-ventas', dashboardAdminController.serieVentas.bind(dashboardAdminController));
router.get('/alertas', dashboardAdminController.alertas.bind(dashboardAdminController));
router.get('/pedidos-recientes', dashboardAdminController.pedidosRecientes.bind(dashboardAdminController));
router.get('/stock-critico', dashboardAdminController.stockCritico.bind(dashboardAdminController));

export default router;
