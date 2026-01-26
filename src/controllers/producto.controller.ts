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
import type { SFactoryItemCreateData, SFactoryItemEditData } from '../types/sfactory.types';

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
      const rawSlugParam = req.params.slug;
      const rawSlug: string = Array.isArray(rawSlugParam) ? rawSlugParam[0] : (rawSlugParam || '');
      let decodedSlug: string = rawSlug;
      
      try {
        // Intentar decodificar si está codificado
        decodedSlug = decodeURIComponent(String(rawSlug));
      } catch (e) {
        // Si falla la decodificación, usar el slug tal cual
        decodedSlug = rawSlug;
      }
      
      // Asegurar que decodedSlug no sea undefined
      const cleanSlug = String(decodedSlug || '').trim();
      
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
      const idParam = req.params.id;
      const idString: string = Array.isArray(idParam) ? String(idParam[0]) : String(idParam || '0');
      const productoPadreId = parseInt(idString);

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

  /**
   * POST /api/productos
   * Crear producto en SFactory y sincronizar incrementalmente
   * Flujo: Crear en SFactory → Sincronizar → Parsear en nuestras tablas
   */
  async crear(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      // Validar body
      const body = req.body as SFactoryItemCreateData;
      
      if (!body.tipo) {
        return res.status(400).json({
          success: false,
          error: 'El campo "tipo" es requerido',
          message: 'Debe especificar el tipo de producto (ej: "P" para producto)',
        });
      }

      if (!body.descripcion) {
        return res.status(400).json({
          success: false,
          error: 'El campo "descripcion" es requerido',
          message: 'Debe especificar la descripción del producto',
        });
      }

      // Crear producto en SFactory y sincronizar
      const producto = await productoService.crearProducto(body, empresaId);

      const response: ApiResponse = {
        success: true,
        data: producto,
        message: 'Producto creado y sincronizado exitosamente',
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('[ProductoController.crear] Error:', error);
      
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }

      // Error de validación de SFactory
      if (error.message && error.message.includes('SFactory')) {
        return res.status(400).json({
          success: false,
          error: 'Error al crear producto en SFactory',
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Error al crear producto',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * POST /api/productos/validar-codigo
   * Validar si un código existe en la base de datos local
   */
  async validarCodigo(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const { codigo } = req.body;

      if (!codigo || typeof codigo !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'El campo "codigo" es requerido y debe ser un string',
        });
      }

      const resultado = await productoService.validarCodigo(codigo, empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.validarCodigo] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al validar código',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/productos/variantes/:codigoBase
   * Obtener variantes de un código base y calcular siguiente número sugerido
   */
  async obtenerVariantesPorCodigoBase(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const codigoBaseParam = req.params.codigoBase;
      const codigoBase: string = Array.isArray(codigoBaseParam) ? String(codigoBaseParam[0]) : String(codigoBaseParam || '');

      if (!codigoBase) {
        return res.status(400).json({
          success: false,
          error: 'Código base es requerido',
        });
      }

      const resultado = await productoService.obtenerVariantesPorCodigoBase(codigoBase, empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.obtenerVariantesPorCodigoBase] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener variantes',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/productos/:productoPadreId/combinaciones
   * Obtener combinaciones Talle+Color existentes de un producto padre
   */
  async obtenerCombinaciones(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const productoPadreId = parseInt(req.params.productoPadreId || '0');

      if (isNaN(productoPadreId) || productoPadreId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de producto padre inválido',
        });
      }

      const resultado = await productoService.obtenerCombinaciones(productoPadreId, empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.obtenerCombinaciones] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener combinaciones',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/productos/buscar-padre
   * Buscar productos padre para crear variantes
   */
  async buscarProductosPadre(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const { nombre, sexo, rubroId, limit } = req.query;

      const params: {
        empresaId: number;
        nombre?: string;
        sexo?: string;
        rubroId?: number;
        limit?: number;
      } = {
        empresaId,
      };

      if (nombre && typeof nombre === 'string') {
        params.nombre = nombre;
      }
      if (sexo && typeof sexo === 'string') {
        params.sexo = sexo;
      }
      if (rubroId) {
        const rubroIdNum = parseInt(String(rubroId));
        if (!isNaN(rubroIdNum)) {
          params.rubroId = rubroIdNum;
        }
      }
      if (limit) {
        const limitNum = parseInt(String(limit));
        if (!isNaN(limitNum) && limitNum > 0) {
          params.limit = limitNum;
        }
      }

      const resultado = await productoService.buscarProductosPadre(params);

      const response: ApiResponse = {
        success: true,
        data: resultado.productos,
        message: `${resultado.total} producto(s) encontrado(s)`,
      };

      res.json({
        ...response,
        total: resultado.total,
      });
    } catch (error: any) {
      console.error('[ProductoController.buscarProductosPadre] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al buscar productos padre',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/productos/:productoPadreId/datos-plantilla
   * Obtener datos plantilla para pre-llenar formulario de variante
   */
  async obtenerDatosPlantilla(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const productoPadreId = parseInt(req.params.productoPadreId || '0');

      if (isNaN(productoPadreId) || productoPadreId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de producto padre inválido',
        });
      }

      const resultado = await productoService.obtenerDatosPlantilla(productoPadreId, empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.obtenerDatosPlantilla] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al obtener datos plantilla',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * PATCH /api/productos/:id/local
   * Actualizar solo datos locales (no SFactory)
   */
  async actualizarDatosLocales(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
      });

      const updateData = req.body;

      const producto = await productoService.actualizarDatosLocales(id, updateData);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      const response: ApiResponse = {
        success: true,
        data: producto,
        message: 'Datos locales actualizados exitosamente',
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
   * PATCH /api/productos/:productoWebId/variante
   * Actualizar datos de variante (Talle y Color)
   */
  async actualizarDatosVariante(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const productoWebId = parseInt(req.params.productoWebId || '0');

      if (isNaN(productoWebId) || productoWebId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de variante inválido',
        });
      }

      const { talle, color } = req.body;

      const updateData: {
        talle?: string | null;
        color?: string | null;
      } = {};

      if (talle !== undefined) {
        updateData.talle = talle === '' || talle === null ? null : String(talle);
      }
      if (color !== undefined) {
        updateData.color = color === '' || color === null ? null : String(color);
      }

      const resultado = await productoService.actualizarDatosVariante(
        productoWebId,
        updateData,
        empresaId
      );

      const response: ApiResponse = {
        success: true,
        data: resultado,
        message: 'Variante actualizada exitosamente',
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.actualizarDatosVariante] Error:', error);
      
      if (error.message && error.message.includes('ya existe')) {
        return res.status(400).json({
          success: false,
          error: 'Combinación duplicada',
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Error al actualizar variante',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * GET /api/productos/:id/completo
   * Obtener producto completo para edición (SFactory + Local + Variante)
   */
  async obtenerProductoCompleto(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;

      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const { id } = ProductoByIdParamsSchema.parse({
        id: req.params.id,
      });

      const resultado = await productoService.obtenerProductoCompleto(id, empresaId);

      const response: ApiResponse = {
        success: true,
        data: resultado,
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.obtenerProductoCompleto] Error:', error);
      
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }

      if (error.message && error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          error: 'Producto no encontrado',
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Error al obtener producto completo',
        message: error.message || 'Error desconocido',
      });
    }
  }

  /**
   * PUT /api/productos/:itemId/sfactory
   * Actualizar producto en SFactory y sincronizar incrementalmente
   * Flujo: Actualizar en SFactory → Sincronizar → Parsear en nuestras tablas
   */
  async actualizarEnSFactory(req: Request, res: Response, next: NextFunction) {
    try {
      const empresaId = (req as any).empresaId;
      
      if (!empresaId) {
        const validation = validateEmpresaId(req);
        return res.status(400).json({
          success: false,
          ...validation,
        });
      }

      const itemId = parseInt(req.params.itemId || '0');
      
      if (isNaN(itemId) || itemId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID de item inválido',
          message: 'El item_id debe ser un número positivo',
        });
      }

      // Validar body
      const body = req.body as Partial<Omit<SFactoryItemEditData, 'item_id'>>;
      
      // Agregar item_id al body y asegurar campos requeridos
      const editData: SFactoryItemEditData = {
        tipo: body.tipo || 'P',
        descripcion: body.descripcion || '',
        ...body,
        item_id: itemId,
      };

      // Actualizar producto en SFactory y sincronizar
      const producto = await productoService.actualizarProducto(itemId, editData, empresaId);

      const response: ApiResponse = {
        success: true,
        data: producto,
        message: 'Producto actualizado y sincronizado exitosamente',
      };

      res.json(response);
    } catch (error: any) {
      console.error('[ProductoController.actualizarEnSFactory] Error:', error);
      
      const zodError = handleZodError(error);
      if (zodError) {
        return res.status(400).json({
          success: false,
          ...zodError,
        });
      }

      // Error de validación de SFactory
      if (error.message && error.message.includes('SFactory')) {
        return res.status(400).json({
          success: false,
          error: 'Error al actualizar producto en SFactory',
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Error al actualizar producto',
        message: error.message || 'Error desconocido',
      });
    }
  }
}

export const productoController = new ProductoController();

