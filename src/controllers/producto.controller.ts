import { Request, Response, NextFunction } from 'express';
import { productoService } from '../services';
import { sfactoryService } from '../services/sfactory/sfactory.service';
import { sfactoryAuthService } from '../services/sfactory/sfactory-auth.service';
import { CacheService } from '../services/cache.service';
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
import { logAudit } from '../services/audit.service';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../config/ecommerce.config';
import { imageUploadService } from '../services/imageUpload.service';
import prisma from '../lib/prisma';
import type { MulterFile } from '../types/multer.types';
import { z } from 'zod';

/** Serializa producto a objeto plano para auditoría (evita relaciones circulares). */
function toAuditProductPayload(p: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!p || typeof p !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const key of ['id', 'nombre', 'publicado', 'destacado', 'descripcion', 'slug', 'codigoAgrupacion', 'empresaId', 'rubroId', 'subrubroId', 'orden']) {
    if (key in p && p[key] !== undefined) out[key] = p[key];
  }
  return Object.keys(out).length ? out : null;
}

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
      
      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('list', {
        empresaId: params.empresaId,
        rubroId: params.rubroId,
        subrubroId: params.subrubroId,
        publicado: params.publicado,
        destacado: params.destacado,
        search: params.search,
        page: params.page,
        limit: params.limit,
        includeVariantes: params.includeVariantes,
      });

      // Cache-aside pattern
      const resultado = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getAll(params as Parameters<typeof productoService.getAll>[0] & { empresaId: number }),
        180 // 3 minutos para listas
      );

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
      
      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('padre', {
        id,
        includeVariantes,
      });

      // Cache-aside pattern
      const producto = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getById(id, includeVariantes),
        300 // 5 minutos para detalles
      );

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
      const rawSlug: string = Array.isArray(rawSlugParam) ? String(rawSlugParam[0] || '') : String(rawSlugParam || '');
      let decodedSlug: string = rawSlug;
      
      try {
        // Intentar decodificar si está codificado
        decodedSlug = decodeURIComponent(rawSlug);
      } catch (e) {
        // Si falla la decodificación, usar el slug tal cual
        decodedSlug = rawSlug;
      }
      
      // Asegurar que decodedSlug no sea undefined
      const cleanSlug = decodedSlug.trim();
      
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
      
      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('slug', {
        slug: params.slug,
        empresaId: params.empresaId,
        includeVariantes,
      });

      // Cache-aside pattern
      const producto = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getBySlug(params.slug, params.empresaId, includeVariantes),
        300 // 5 minutos para detalles
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
      const idString: string = Array.isArray(idParam) ? String(idParam[0] || '0') : String(idParam || '0');
      const productoPadreId = parseInt(idString, 10);

      if (isNaN(productoPadreId)) {
        return res.status(400).json({
          success: false,
          error: 'ID de producto inválido',
        });
      }

      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('variantes', {
        productoPadreId,
      });

      // Cache-aside pattern
      const variantes = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getVariantesByProductoPadreId(productoPadreId),
        300 // 5 minutos
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
      let oldProduct: Record<string, unknown> | null = null;
      try {
        const prev = await productoService.getById(id, false);
        if (prev) oldProduct = toAuditProductPayload(prev as unknown as Record<string, unknown>);
      } catch {
        // ignorar si no existe
      }

      const producto = await productoService.update(id, updateData);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      await logAudit({
        entity: 'producto_padre',
        entityId: String(id),
        action: 'UPDATE',
        oldValues: oldProduct ?? undefined,
        newValues: toAuditProductPayload(producto as unknown as Record<string, unknown>) ?? undefined,
        empresaId: (req as any).empresaId,
        userId: (req as any).userId,
        userEmail: (req as any).userEmail,
        ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
        userAgent: (req as any).get?.('user-agent'),
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.path,
      });
      (req as any).auditLogged = true;

      // Invalidar cache de productos
      await CacheService.invalidateProducts(producto.empresaId, producto.id);

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

      let empresaId: number | undefined;
      let oldProduct: Record<string, unknown> | null = null;
      try {
        const producto = await productoService.getById(id, false);
        empresaId = producto?.empresaId;
        if (producto) oldProduct = toAuditProductPayload(producto as unknown as Record<string, unknown>);
      } catch {
        // Si falla, continuar sin empresaId
      }

      await productoService.delete(id);

      await logAudit({
        entity: 'producto_padre',
        entityId: String(id),
        action: 'DELETE',
        oldValues: oldProduct ?? undefined,
        newValues: undefined,
        empresaId,
        userId: (req as any).userId,
        userEmail: (req as any).userEmail,
        ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
        userAgent: (req as any).get?.('user-agent'),
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.path,
      });
      (req as any).auditLogged = true;

      // Invalidar cache de productos
      await CacheService.invalidateProducts(empresaId, id);

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

  async bulkUpdatePublicado(req: Request, res: Response, next: NextFunction) {
    try {
      const { ids, publicado } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'ids debe ser un array no vacío',
        });
      }

      if (typeof publicado !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'publicado debe ser un booleano',
        });
      }

      const oldMap: Record<number, { publicado?: boolean }> = {};
      for (const id of ids) {
        try {
          const p = await productoService.getById(Number(id), false);
          if (p) oldMap[Number(id)] = { publicado: (p as any).publicado };
        } catch {
          // ignorar
        }
      }

      const empresaId = (req as any).empresaId;
      const result = await productoService.bulkUpdatePublicado(ids, publicado);

      for (const id of ids) {
        const numId = Number(id);
        await logAudit({
          entity: 'producto_padre',
          entityId: String(numId),
          action: 'UPDATE',
          oldValues: oldMap[numId] ?? undefined,
          newValues: { publicado },
          empresaId,
          userId: (req as any).userId,
          userEmail: (req as any).userEmail,
          ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
          userAgent: (req as any).get?.('user-agent'),
          method: req.method,
          path: req.originalUrl?.split('?')[0] ?? req.path,
        });
      }
      (req as any).auditLogged = true;

      // Invalidar cache
      await CacheService.invalidateProducts(empresaId);

      const response: ApiResponse = {
        success: true,
        data: { count: result.count },
        message: `${result.count} producto(s) actualizado(s) exitosamente`,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  async bulkUpdateDestacado(req: Request, res: Response, next: NextFunction) {
    try {
      const { ids, destacado } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'ids debe ser un array no vacío',
        });
      }

      if (typeof destacado !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'destacado debe ser un booleano',
        });
      }

      const oldMap: Record<number, { destacado?: boolean }> = {};
      for (const id of ids) {
        try {
          const p = await productoService.getById(Number(id), false);
          if (p) oldMap[Number(id)] = { destacado: (p as any).destacado };
        } catch {
          // ignorar
        }
      }

      const empresaId = (req as any).empresaId;
      const result = await productoService.bulkUpdateDestacado(ids, destacado);

      for (const id of ids) {
        const numId = Number(id);
        await logAudit({
          entity: 'producto_padre',
          entityId: String(numId),
          action: 'UPDATE',
          oldValues: oldMap[numId] ?? undefined,
          newValues: { destacado },
          empresaId,
          userId: (req as any).userId,
          userEmail: (req as any).userEmail,
          ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
          userAgent: (req as any).get?.('user-agent'),
          method: req.method,
          path: req.originalUrl?.split('?')[0] ?? req.path,
        });
      }
      (req as any).auditLogged = true;

      // Invalidar cache
      await CacheService.invalidateProducts(empresaId);

      const response: ApiResponse = {
        success: true,
        data: { count: result.count },
        message: `${result.count} producto(s) actualizado(s) exitosamente`,
      };

      res.json(response);
    } catch (error) {
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

      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('activos', {
        empresaId: params.empresaId,
        rubroId: params.rubroId,
        subrubroId: params.subrubroId,
        page: params.page,
        limit: params.limit,
      });

      // Cache-aside pattern
      const resultado = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getActivos(params),
        180 // 3 minutos para listas
      );

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

      // Construir key de cache
      const cacheKey = CacheService.buildProductKey('destacados', {
        empresaId: params.empresaId,
        rubroId: params.rubroId,
        subrubroId: params.subrubroId,
        page: params.page,
        limit: params.limit,
      });

      // Cache-aside pattern
      const resultado = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getDestacados(params),
        180 // 3 minutos para listas
      );

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

      // Construir key de cache (todos los params que afectan el resultado)
      const cacheKey = CacheService.buildProductKey('publicados', {
        empresaId: params.empresaId,
        rubroId: params.rubroId,
        subrubroId: params.subrubroId,
        page: params.page,
        limit: params.limit,
        destacado: params.destacado,
        tieneStock: params.tieneStock,
        sexo: params.sexo,
        search: params.search,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });

      // Cache-aside pattern
      const resultado = await CacheService.cacheAside(
        cacheKey,
        () => productoService.getPublicadosOptimizado(params),
        180 // 3 minutos para listas
      );

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
      let lista: any[] = [];
      if (Array.isArray(productos)) {
        lista = productos;
      } else if (productos && typeof productos === 'object' && 'data' in productos && Array.isArray((productos as any).data)) {
        lista = (productos as any).data;
      }
      const filtrados = lista.filter((p: any) => {
        const rid = p.rubro_id ?? p.RubroId ?? null;
        return rid != null && ECOMMERCE_RUBROS_SFACTORY_IDS.includes(Number(rid));
      });

      const response: ApiResponse = {
        success: true,
        data: filtrados,
        message: 'Productos obtenidos desde SFactory (solo rubros ecommerce)',
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

      if (body.rubro_id == null || !ECOMMERCE_RUBROS_SFACTORY_IDS.includes(Number(body.rubro_id))) {
        return res.status(400).json({
          success: false,
          error: 'Rubro no permitido',
          message: 'Solo se permiten productos de rubros PRODUCTO WORKWEAR (3285) y PRODUCTO OFFICE (3314).',
        });
      }

      // Crear producto en SFactory y sincronizar
      const producto = await productoService.crearProducto(body, empresaId);

      // Invalidar cache de productos
      await CacheService.invalidateProducts(empresaId, producto.id);

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

      const productoPadreIdParam = req.params.productoPadreId;
      const productoPadreIdString: string = Array.isArray(productoPadreIdParam) 
        ? (productoPadreIdParam[0] ? String(productoPadreIdParam[0]) : '0') 
        : (productoPadreIdParam ? String(productoPadreIdParam) : '0');
      const productoPadreId = parseInt(productoPadreIdString, 10);

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

      const productoPadreIdParam = req.params.productoPadreId;
      const productoPadreIdString: string = Array.isArray(productoPadreIdParam) 
        ? (productoPadreIdParam[0] ? String(productoPadreIdParam[0]) : '0') 
        : (productoPadreIdParam ? String(productoPadreIdParam) : '0');
      const productoPadreId = parseInt(productoPadreIdString, 10);

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
      let oldProduct: Record<string, unknown> | null = null;
      try {
        const prev = await productoService.getById(id, false);
        if (prev) oldProduct = toAuditProductPayload(prev as unknown as Record<string, unknown>);
      } catch {
        // ignorar
      }

      const producto = await productoService.actualizarDatosLocales(id, updateData);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado',
        });
      }

      await logAudit({
        entity: 'producto_padre',
        entityId: String(id),
        action: 'UPDATE',
        oldValues: oldProduct ?? undefined,
        newValues: toAuditProductPayload(producto as unknown as Record<string, unknown>) ?? undefined,
        empresaId: (req as any).empresaId,
        userId: (req as any).userId,
        userEmail: (req as any).userEmail,
        ipAddress: (req as any).ip ?? (req as any).socket?.remoteAddress,
        userAgent: (req as any).get?.('user-agent'),
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.path,
      });
      (req as any).auditLogged = true;

      // Invalidar cache de productos
      await CacheService.invalidateProducts(producto.empresaId, producto.id);

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

      const productoWebIdParam = req.params.productoWebId;
      const productoWebIdString: string = Array.isArray(productoWebIdParam) 
        ? (productoWebIdParam[0] ? String(productoWebIdParam[0]) : '0') 
        : (productoWebIdParam ? String(productoWebIdParam) : '0');
      const productoWebId = parseInt(productoWebIdString, 10);

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

      // Invalidar cache de productos (variante afecta al producto padre)
      if (resultado?.productoPadreId) {
        await CacheService.invalidateProducts(empresaId, resultado.productoPadreId);
      } else {
        await CacheService.invalidateProducts(empresaId);
      }

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

      const itemIdParam = req.params.itemId;
      const itemIdString: string = Array.isArray(itemIdParam) 
        ? (itemIdParam[0] ? String(itemIdParam[0]) : '0') 
        : (itemIdParam ? String(itemIdParam) : '0');
      const itemId = parseInt(itemIdString, 10);
      
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

      if (editData.rubro_id != null && !ECOMMERCE_RUBROS_SFACTORY_IDS.includes(Number(editData.rubro_id))) {
        return res.status(400).json({
          success: false,
          error: 'Rubro no permitido',
          message: 'Solo se permiten rubros PRODUCTO WORKWEAR (3285) y PRODUCTO OFFICE (3314).',
        });
      }

      // Actualizar producto en SFactory y sincronizar
      const producto = await productoService.actualizarProducto(itemId, editData, empresaId);

      // Invalidar cache de productos
      await CacheService.invalidateProducts(empresaId, producto.id);

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

  // ---------------------------------------------------------------------------
  // Documentos: Tabla de Talles y Ficha Técnica
  // ---------------------------------------------------------------------------

  private async _uploadDocumento(
    req: Request,
    res: Response,
    next: NextFunction,
    tipo: 'tabla-talles' | 'ficha-tecnica',
    campo: 'tablaTallesUrl' | 'fichaTecnicaUrl'
  ) {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const file = req.file as MulterFile | undefined;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'No se proporcionó ningún archivo',
        });
      }

      // Obtener nombre y empresa del producto padre para path FTP y invalidación de cache
      const productoPadre = await prisma.productoPadre.findUnique({
        where: { id },
        select: { id: true, nombre: true, empresaId: true },
      });

      if (!productoPadre) {
        return res.status(404).json({ success: false, error: 'Producto padre no encontrado' });
      }

      const url = await imageUploadService.uploadDocument({
        nombreBase: productoPadre.nombre,
        tipo,
        file,
      });

      const updated = await prisma.productoPadre.update({
        where: { id },
        data: { [campo]: url },
        select: { id: true, [campo]: true },
      });

      await CacheService.invalidateProducts(productoPadre.empresaId, id);

      return res.json({
        success: true,
        data: updated,
        message: 'Documento subido exitosamente',
      });
    } catch (error: any) {
      const zodError = handleZodError(error);
      if (zodError) return res.status(400).json({ success: false, ...zodError });
      next(error);
    }
  }

  private async _deleteDocumento(
    req: Request,
    res: Response,
    next: NextFunction,
    campo: 'tablaTallesUrl' | 'fichaTecnicaUrl'
  ) {
    try {
      const productoPadreId = z.coerce.number().int().positive().parse(req.params.id);

      const productoPadre = await prisma.productoPadre.findUnique({
        where: { id: productoPadreId },
        select: { id: true, empresaId: true, tablaTallesUrl: true, fichaTecnicaUrl: true },
      });

      if (!productoPadre) {
        return res.status(404).json({ success: false, error: 'Producto padre no encontrado' });
      }

      const empresaId = productoPadre.empresaId;

      await prisma.productoPadre.update({
        where: { id: productoPadreId },
        data: { [campo]: null },
      });

      await CacheService.invalidateProducts(empresaId, productoPadreId);

      return res.json({ success: true, message: 'Documento eliminado exitosamente' });
    } catch (error: any) {
      const zodError = handleZodError(error);
      if (zodError) return res.status(400).json({ success: false, ...zodError });
      next(error);
    }
  }

  /**
   * PATCH /api/productos/:id/tabla-talles
   */
  async uploadTablaTalles(req: Request, res: Response, next: NextFunction) {
    return this._uploadDocumento(req, res, next, 'tabla-talles', 'tablaTallesUrl');
  }

  /**
   * DELETE /api/productos/:id/tabla-talles
   */
  async deleteTablaTalles(req: Request, res: Response, next: NextFunction) {
    return this._deleteDocumento(req, res, next, 'tablaTallesUrl');
  }

  /**
   * PATCH /api/productos/:id/ficha-tecnica
   */
  async uploadFichaTecnica(req: Request, res: Response, next: NextFunction) {
    return this._uploadDocumento(req, res, next, 'ficha-tecnica', 'fichaTecnicaUrl');
  }

  /**
   * DELETE /api/productos/:id/ficha-tecnica
   */
  async deleteFichaTecnica(req: Request, res: Response, next: NextFunction) {
    return this._deleteDocumento(req, res, next, 'fichaTecnicaUrl');
  }
}

export const productoController = new ProductoController();

