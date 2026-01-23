import { Request, Response, NextFunction } from 'express';
import { productoService } from '../services';
import { sfactoryService } from '../services/sfactory/sfactory.service';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';
import {
  ProductoQueryParamsSchema,
  ProductoByIdParamsSchema,
  ProductoBySlugParamsSchema,
  ProductoActivoQueryParamsSchema,
  ProductoPublicadoQueryParamsSchema,
  ApiResponse,
  PaginatedApiResponse,
} from '../types';
import { validateEmpresaId, handleZodError } from '../utils/validation';

export class ProductoController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const queryParams: Record<string, any> = Object.assign({}, req.query);
      
      if (!queryParams.empresaId && (req as any).empresaId) {
        queryParams.empresaId = String((req as any).empresaId);
      }
      
      if (queryParams.empresaId) {
        const empresaIdNum = Number(queryParams.empresaId);
        if (!isNaN(empresaIdNum) && empresaIdNum > 0) {
          queryParams.empresaId = empresaIdNum;
        } else {
          delete queryParams.empresaId;
        }
      }
      
      const params = ProductoQueryParamsSchema.parse(queryParams) as Parameters<typeof productoService.getAll>[0];
      
      if (!params.empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }
      
      const resultado = await productoService.getAll(params as Parameters<typeof productoService.getAll>[0] & { empresaId: number });

      const response: ApiResponse = {
        success: true,
        data: resultado.data,
        message: 'Productos obtenidos exitosamente',
      };

      // Agregar información de paginación a la respuesta
      res.json({
        ...response,
        pagination: resultado.pagination,
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
        includeVariantes: req.query.includeVariantes,
      });

      const includeVariantes = req.query.includeVariantes === 'true';
      const producto = await productoService.getById(id, includeVariantes);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: producto,
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  async getBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      // Decodificar el slug que viene de la URL (Express ya lo decodifica, pero por si acaso)
      const rawSlug = req.params.slug || '';
      let decodedSlug = rawSlug;
      
      try {
        // Intentar decodificar si está codificado
        decodedSlug = decodeURIComponent(rawSlug);
      } catch (e) {
        // Si falla la decodificación, usar el slug tal cual
        decodedSlug = rawSlug;
      }
      
      // Asegurar que decodedSlug no sea undefined
      const cleanSlug = (decodedSlug || '').trim();
      
      if (!cleanSlug) {
        return res.status(400).json({
          success: false,
          message: 'Slug es requerido',
        });
      }
      
      console.log('[ProductoController.getBySlug]', { 
        rawSlug, 
        decodedSlug: cleanSlug, 
        empresaId: req.query.empresaId 
      });
      
      const params = ProductoBySlugParamsSchema.parse({
        slug: cleanSlug,
        empresaId: req.query.empresaId,
        includeVariantes: req.query.includeVariantes,
      });

      const includeVariantes = params.includeVariantes !== false;
      const producto = await productoService.getBySlug(
        params.slug,
        params.empresaId,
        includeVariantes
      );

      if (!producto) {
        console.log('[ProductoController.getBySlug] Product not found:', { 
          slug: params.slug, 
          empresaId: params.empresaId 
        });
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      // Obtener productos relacionados
      const relatedProducts = await productoService.getRelatedProducts(
        producto.id,
        params.empresaId,
        10
      );

      const response: ApiResponse = {
        success: true,
        data: {
          producto,
          relatedProducts,
        },
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  async getVariantes(req: Request, res: Response, next: NextFunction) {
    try {
      const productoPadreId = parseInt(req.params.id || '0');

      if (isNaN(productoPadreId)) {
        return res.status(400).json({
          success: false,
          error: 'ID de producto inválido',
        });
      }

      const variantes = await productoService.getVariantesByProductoPadreId(
        productoPadreId
      );

      const response: ApiResponse = {
        success: true,
        data: variantes,
        message: 'Variantes obtenidas exitosamente',
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
      });

      const updateData = req.body;
      const producto = await productoService.update(id, updateData);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: producto,
        message: 'Producto actualizado exitosamente',
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
      });

      await productoService.delete(id);

      const response: ApiResponse = {
        success: true,
        message: 'Producto eliminado exitosamente',
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      
      // Si el producto no existe, Prisma lanzará un error
      if ((error as any)?.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }
      
      next(error);
    }
  }

  /**
   * Endpoint público para obtener productos activos del ecommerce
   * Solo devuelve productos publicados con variantes activas
   * Fuente de verdad para el cliente
   */
  async getActivos(req: Request, res: Response, next: NextFunction) {
    try {
      // Validar query params
      const queryParams: Record<string, any> = Object.assign({}, req.query);
      
      // empresaId es requerido para productos activos
      if (!queryParams.empresaId && (req as any).empresaId) {
        queryParams.empresaId = String((req as any).empresaId);
      }

      // Validar y parsear params
      const params = ProductoActivoQueryParamsSchema.parse(queryParams);

      // Validar empresaId
      if (!params.empresaId || params.empresaId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'empresaId es requerido y debe ser un número positivo',
          message: 'El ID de empresa es obligatorio para obtener productos activos',
        });
      }

      // Validar límite de paginación
      if (params.limit && (params.limit < 1 || params.limit > 100)) {
        return res.status(400).json({
          success: false,
          error: 'El límite debe estar entre 1 y 100',
          message: 'El parámetro limit debe ser un número entre 1 y 100',
        });
      }

      // Validar página
      if (params.page && params.page < 1) {
        return res.status(400).json({
          success: false,
          error: 'La página debe ser un número positivo',
          message: 'El parámetro page debe ser mayor a 0',
        });
      }

      // Obtener productos activos
      const resultado = await productoService.getActivos(params);

      // Respuesta exitosa
      const response: ApiResponse = {
        success: true,
        data: resultado.data,
        message: 'Productos activos obtenidos exitosamente',
      };

      res.json({
        ...response,
        pagination: resultado.pagination,
      });
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/productos/destacados
   * Endpoint público para productos destacados
   * Retorna solo productos publicados Y destacados
   * empresaId se obtiene internamente desde la configuración de SFactory
   */
  async getDestacados(req: Request, res: Response, next: NextFunction) {
    try {
      // Obtener empresaId internamente (proceso interno, no parámetro público)
      const empresaId = await sfactoryAuthService.getEmpresaId();

      if (!empresaId) {
        return res.status(500).json({
          success: false,
          error: 'Error de configuración',
          message: 'No se pudo obtener el empresaId. Verifica la configuración de SFACTORY_COMPANY_KEY.',
        });
      }

      const queryParams = req.query;

      // Validar y parsear parámetros (sin destacado ni empresaId en el schema público)
      // Remover destacado de params si viene (lo forzamos a true)
      const { destacado, ...paramsSinDestacado } = queryParams;
      const params = ProductoPublicadoQueryParamsSchema.parse(paramsSinDestacado) as any;

      // Agregar empresaId y destacado internamente
      params.empresaId = empresaId;
      params.destacado = true; // Siempre destacados

      // Validar límite
      if (params.limit && (params.limit < 1 || params.limit > 100)) {
        return res.status(400).json({
          success: false,
          error: 'El límite debe estar entre 1 y 100',
          message: 'El parámetro limit debe ser un número entre 1 y 100',
        });
      }

      // Validar página
      if (params.page && params.page < 1) {
        return res.status(400).json({
          success: false,
          error: 'La página debe ser un número positivo',
          message: 'El parámetro page debe ser mayor a 0',
        });
      }

      // Obtener productos destacados (reutiliza getPublicadosOptimizado)
      const resultado = await productoService.getDestacados(params);

      // Respuesta exitosa normalizada con paginación
      // TypeScript no reconoce correctamente la herencia, pero el tipo tiene data y pagination
      const response: PaginatedApiResponse = {
        success: true,
        data: (resultado as any).data,
        message: 'Productos destacados obtenidos exitosamente',
        pagination: (resultado as any).pagination,
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/productos/publicados
   * Endpoint público optimizado para ecommerce
   * Retorna productos publicados con estructura optimizada para renderizado
   * empresaId se obtiene internamente desde la configuración de SFactory
   */
  async getPublicados(req: Request, res: Response, next: NextFunction) {
    try {
      // Obtener empresaId internamente (proceso interno, no parámetro público)
      const empresaId = await sfactoryAuthService.getEmpresaId();

      if (!empresaId) {
        return res.status(500).json({
          success: false,
          error: 'Error de configuración',
          message: 'No se pudo obtener el empresaId. Verifica la configuración de SFACTORY_COMPANY_KEY.',
        });
      }

      const queryParams = req.query;

      // Validar y parsear parámetros (sin empresaId en el schema público)
      const params = ProductoPublicadoQueryParamsSchema.parse(queryParams) as any;

      // Agregar empresaId internamente
      params.empresaId = empresaId;

      // Validar límite
      if (params.limit && (params.limit < 1 || params.limit > 100)) {
        return res.status(400).json({
          success: false,
          error: 'El límite debe estar entre 1 y 100',
          message: 'El parámetro limit debe ser un número entre 1 y 100',
        });
      }

      // Validar página
      if (params.page && params.page < 1) {
        return res.status(400).json({
          success: false,
          error: 'La página debe ser un número positivo',
          message: 'El parámetro page debe ser mayor a 0',
        });
      }

      // Obtener productos publicados optimizados
      const resultado = await productoService.getPublicadosOptimizado(params);

      // Respuesta exitosa normalizada con paginación
      // TypeScript no reconoce correctamente la herencia, pero el tipo tiene data y pagination
      const response: PaginatedApiResponse = {
        success: true,
        data: (resultado as any).data,
        message: 'Productos publicados obtenidos exitosamente',
        pagination: (resultado as any).pagination,
      };

      res.json(response);
    } catch (error) {
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/productos/sfactory
   * Listar productos directamente desde SFactory (sin sincronizar)
   */
  async listarDesdeSFactory(req: Request, res: Response, next: NextFunction) {
    try {
      const productos = await sfactoryService.listarItems();
      
      const response: ApiResponse = {
        success: true,
        data: productos,
        message: 'Productos obtenidos desde SFactory',
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.listarDesdeSFactory] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al listar productos desde SFactory',
        message: error.message || 'Error desconocido',
      });
    }
  }
}

export const productoController = new ProductoController();

