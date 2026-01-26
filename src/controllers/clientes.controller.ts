import { Request, Response, NextFunction } from 'express';
import { clientesService } from '../services/clientes.service';
import { CacheService } from '../services/cache.service';
import type { ApiResponse } from '../types';
import { ZodError } from 'zod';

export class ClientesController {
  /**
   * GET /api/clientes
   * Lista todos los clientes desde nuestra BD
   */
  async listar(req: Request, res: Response, next: NextFunction) {
    try {
      // Obtener empresaId del middleware (inyectado automáticamente)
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId. Inicializa la sesión con SFactory primero.',
        });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const search = req.query.search as string | undefined;
      const activo =
        req.query.activo !== undefined
          ? req.query.activo === 'true'
          : undefined;

      // Construir key de cache
      const cacheKey = CacheService.buildClientKey('list', {
        empresaId,
        page,
        limit,
        search,
        activo,
      });

      // Cache-aside pattern
      const resultado = await CacheService.cacheAside(
        cacheKey,
        () => clientesService.listar(empresaId, { page, limit, search, activo }),
        180 // 3 minutos para listas
      );

      const response: ApiResponse = {
        success: true,
        data: resultado.data,
        message: 'Clientes obtenidos exitosamente',
      };

      res.json({
        ...response,
        pagination: resultado.pagination,
      });
    } catch (error: any) {
      console.error('[ClientesController.listar] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al listar clientes',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/clientes/:id
   * Obtener cliente por ID
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId.',
        });
      }

      const idParam = req.params.id;
      if (!idParam) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'El ID es requerido',
        });
      }
      const idString: string = Array.isArray(idParam) 
        ? (idParam[0] ? String(idParam[0]) : '') 
        : (idParam ? String(idParam) : '');
      if (!idString) {
        return res.status(400).json({
          success: false,
          error: 'ID requerido',
          message: 'El ID es requerido',
        });
      }
      const id = parseInt(idString, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'ID inválido',
          message: 'El ID debe ser un número válido',
        });
      }

      // Construir key de cache
      const cacheKey = CacheService.buildClientKey('id', {
        id,
        empresaId,
      });

      // Cache-aside pattern
      const cliente = await CacheService.cacheAside(
        cacheKey,
        () => clientesService.getById(id, empresaId),
        300 // 5 minutos para detalles
      );

      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: cliente,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ClientesController.getById] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener cliente',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * POST /api/clientes
   * Crear cliente en SFactory y guardar en nuestra BD
   */
  async crear(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId.',
        });
      }

      const datosCliente = req.body;

      // Validaciones básicas
      if (!datosCliente.razonSocial) {
        return res.status(400).json({
          success: false,
          error: 'Datos inválidos',
          message: 'El campo razonSocial es requerido',
        });
      }

      const cliente = await clientesService.crear(datosCliente, empresaId);

      // Invalidar cache de clientes
      await CacheService.invalidateClients(empresaId, cliente.id);

      const response: ApiResponse = {
        success: true,
        data: cliente,
        message: 'Cliente creado exitosamente',
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('[ClientesController.crear] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al crear cliente',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * POST /api/clientes/sync
   * Sincronizar clientes desde SFactory a nuestra BD
   */
  async sincronizar(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        return res.status(400).json({
          success: false,
          error: 'Sesión no inicializada',
          message: 'No se pudo obtener empresaId.',
        });
      }

      const resultado = await clientesService.sincronizar(empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: `Sincronización completada: ${resultado.exitosos} exitosos, ${resultado.fallidos} fallidos`,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ClientesController.sincronizar] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al sincronizar clientes',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/clientes/sfactory
   * Lista clientes directamente desde SFactory (sin guardar en BD)
   * Útil para ver la estructura de datos
   */
  async listarDesdeSFactory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.query || {};

      const resultado = await clientesService.listarDesdeSFactory(data);

      res.json(resultado);
    } catch (error: any) {
      console.error('[ClientesController.listarDesdeSFactory] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al listar clientes desde SFactory',
        message: error.message || 'Error desconocido',
      });
    }
  }
}

export const clientesController = new ClientesController();
