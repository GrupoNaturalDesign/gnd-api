import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  ProductoQueryParams,
  ProductoPadreConVariantes,
  ProductoBySlugParams,
  ProductoActivoQueryParams,
  PaginatedResponse,
  ProductoPublicadoQueryParams,
  ProductosPublicadosResponse,
  ProductoPublicado,
  VariantePublicada,
} from '../types';
import { sfactoryService } from './sfactory/sfactory.service';
import { productoSyncService } from './sync/producto-sync.service';
import type { SFactoryItemCreateData, SFactoryItemEditData, SFactoryProduct, SFactoryItemCreateResponse } from '../types/sfactory.types';
import { extraerCodigoAgrupacion } from './producto-agrupacion.service';
import { ECOMMERCE_RUBROS_SFACTORY_IDS, isRubroPermitidoEcommerce } from '../config/ecommerce.config';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../config/precios.config';

export class ProductoService {
  /**
   * IDs locales de los rubros ecommerce (WORKWEAR 3285, OFFICE 3314) para una empresa.
   * Usado para filtrar listados de productos.
   */
  private async getRubroIdsEcommerce(empresaId: number): Promise<number[]> {
    const rubros = await prisma.rubro.findMany({
      where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
      select: { id: true },
    });
    return rubros.map((r) => r.id);
  }

  async getAll(
    params: ProductoQueryParams
  ): Promise<PaginatedResponse<ProductoPadreConVariantes>> {
    // Ecommerce: solo productos de rubros permitidos cuando hay empresaId
    const rubroIdsEcommerce =
      params.empresaId !== undefined ? await this.getRubroIdsEcommerce(params.empresaId) : [];

    const where: Prisma.ProductoPadreWhereInput = {
      ...(params.empresaId !== undefined && {
        empresaId: params.empresaId,
      }),
      // Ecommerce: solo rubros permitidos; si viene rubroId, filtrar dentro de esos
      ...(params.empresaId !== undefined && {
        rubroId: params.rubroId
          ? params.rubroId
          : rubroIdsEcommerce.length > 0
            ? { in: rubroIdsEcommerce }
            : { in: [] },
      }),
      ...(params.empresaId === undefined && params.rubroId && {
        rubroId: params.rubroId,
      }),
      ...(params.subrubroId && {
        subrubroId: params.subrubroId,
      }),
      ...(params.publicado !== undefined && {
        publicado: params.publicado,
      }),
      ...(params.destacado !== undefined && {
        destacado: params.destacado,
      }),
      ...((params.genero || params.sexo) && {
        genero: (params.genero || params.sexo) as string,
      }),
      ...(params.search && {
        OR: [
          {
            nombre: {
              contains: params.search,
            },
          },
          {
            descripcion: {
              contains: params.search,
            },
          },
          {
            codigoAgrupacion: {
              contains: params.search,
            },
          },
        ],
      }),
    };

    const include: Prisma.ProductoPadreInclude = {
      productosWeb: params.includeVariantes
        ? {
          where: {
            activoSfactory: true,
          },
          include: {
            precios: true,
          },
          orderBy: [
            { color: 'asc' },
            { talle: 'asc' },
          ],
        }
        : false,
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      subrubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      _count: {
        select: {
          productosWeb: true,
        },
      },
    };

    // Paginación: valores por defecto
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = params.offset !== undefined ? params.offset : (page - 1) * limit;

    // Obtener total de registros
    const total = await prisma.productoPadre.count({ where });

    // Obtener datos paginados
    const data = await prisma.productoPadre.findMany({
      where,
      include,
      orderBy: [
        { destacado: 'desc' },
        { orden: 'asc' },
        { nombre: 'asc' },
      ],
      skip,
      take: limit,
    }) as ProductoPadreConVariantes[];

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getById(
    id: number,
    includeVariantes = false
  ): Promise<ProductoPadreConVariantes | null> {
    const include: Prisma.ProductoPadreInclude = {
      productosWeb: includeVariantes
        ? {
          where: {
            activoSfactory: true,
          },
          orderBy: [
            { color: 'asc' },
            { talle: 'asc' },
          ],
        }
        : false,
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      subrubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      _count: {
        select: {
          productosWeb: true,
        },
      },
    };

    return prisma.productoPadre.findUnique({
      where: { id },
      include,
    }) as Promise<ProductoPadreConVariantes | null>;
  }

  async getBySlug(
    slug: string,
    empresaId: number,
    includeVariantes = false
  ): Promise<ProductoPadreConVariantes | null> {
    const include: Prisma.ProductoPadreInclude = {
      productosWeb: includeVariantes
        ? {
          where: {
            activoSfactory: true,
          },
          include: {
            precios: true,
            imagenes: {
              orderBy: { orden: 'asc' },
              take: 5,
            },
          },
          orderBy: [
            { color: 'asc' },
            { talle: 'asc' },
          ],
        }
        : false,
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      subrubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      _count: {
        select: {
          productosWeb: true,
        },
      },
    };

    // Limpiar el slug
    const cleanSlug = slug.trim();

    console.log('[ProductoService.getBySlug] Searching:', {
      slug: cleanSlug,
      empresaId
    });

    // Primero intentar búsqueda exacta
    let producto = await prisma.productoPadre.findFirst({
      where: {
        slug: cleanSlug,
        empresaId,
        publicado: true,
      },
      include,
    }) as ProductoPadreConVariantes | null;

    // Si no se encuentra, intentar búsqueda case-insensitive
    if (!producto) {
      console.log('[ProductoService.getBySlug] Exact match not found, trying case-insensitive');

      // Obtener todos los productos publicados de la empresa para buscar manualmente
      const allProducts = await prisma.productoPadre.findMany({
        where: {
          empresaId,
          publicado: true,
          slug: { not: null },
        },
        select: { id: true, slug: true },
      });

      // Buscar coincidencia case-insensitive
      const found = allProducts.find((p: { id: number; slug: string | null }): boolean =>
        p.slug !== null && String(p.slug).toLowerCase().trim() === cleanSlug.toLowerCase()
      );

      if (found) {
        console.log('[ProductoService.getBySlug] Found case-insensitive match:', found.slug);
        producto = await prisma.productoPadre.findFirst({
          where: { id: found.id },
          include,
        }) as ProductoPadreConVariantes | null;
      }
    }

    if (!producto) {
      console.log('[ProductoService.getBySlug] Product not found after all attempts');
    } else {
      console.log('[ProductoService.getBySlug] Product found:', producto.id);
    }

    return producto;
  }

  /**
   * Obtiene productos relacionados basado en rubro y subrubro
   */
  async getRelatedProducts(
    productoId: number,
    empresaId: number,
    limit: number = 10
  ): Promise<ProductoPadreConVariantes[]> {
    // Primero obtener el producto para conocer su rubro y subrubro
    const producto = await prisma.productoPadre.findUnique({
      where: { id: productoId },
      select: {
        rubroId: true,
        subrubroId: true,
      },
    });

    if (!producto) {
      return [];
    }

    // Construir where clause para productos relacionados
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId,
      publicado: true,
      id: { not: productoId }, // Excluir el producto actual
      productosWeb: {
        some: {
          activoSfactory: true,
        },
      },
      OR: [
        // Prioridad 1: Mismo subrubro
        ...(producto.subrubroId
          ? [
            {
              subrubroId: producto.subrubroId,
            },
          ]
          : []),
        // Prioridad 2: Mismo rubro
        ...(producto.rubroId
          ? [
            {
              rubroId: producto.rubroId,
              subrubroId: producto.subrubroId ? { not: producto.subrubroId } : undefined,
            },
          ]
          : []),
      ],
    };

    const include: Prisma.ProductoPadreInclude = {
      productosWeb: {
        where: {
          activoSfactory: true,
        },
        include: {
          imagenes: {
            orderBy: { orden: 'asc' },
            take: 1,
            select: { imagenUrl: true },
          },
          precios: {
            where: { tipoCliente: 'minorista' },
            take: 1,
          },
        },
        orderBy: [{ color: 'asc' }, { talle: 'asc' }],
        take: 1, // Solo una variante para el preview
      },
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      subrubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
    };

    const productos = await prisma.productoPadre.findMany({
      where,
      include,
      orderBy: [
        { destacado: 'desc' },
        { orden: 'asc' },
        { nombre: 'asc' },
      ],
      take: limit,
    });

    return productos as ProductoPadreConVariantes[];
  }

  async getVariantesByProductoPadreId(
    productoPadreId: number
  ): Promise<any[]> {
    return prisma.productoWeb.findMany({
      where: {
        productoPadreId,
        activoSfactory: true,
      },
      orderBy: [
        { color: 'asc' },
        { talle: 'asc' },
      ],
    });
  }

  /**
   * Crear producto en SFactory y sincronizar incrementalmente
   * Reutiliza toda la lógica de parsing existente
   */
  async crearProducto(
    data: SFactoryItemCreateData,
    empresaId: number
  ): Promise<ProductoPadreConVariantes> {
    // 0. Validar código no existe (última validación antes de crear)
    if (data.codigo) {
      const validacion = await this.validarCodigo(data.codigo, empresaId);
      if (validacion.existe) {
        throw new Error(
          `El código "${data.codigo}" ya existe en la base de datos. Por favor sincroniza los productos primero o usa otro código.`
        );
      }
    }

    if (!isRubroPermitidoEcommerce(data.rubro_id ?? undefined)) {
      throw new Error(
        'Solo se permiten productos de rubros PRODUCTO WORKWEAR (3285) y PRODUCTO OFFICE (3314).'
      );
    }

    // 1. Asegurar que um_id y moneda_id tengan valores por defecto si no se proporcionan
    // SFactory requiere um_id y moneda_id, valores por defecto comunes son 1
    const dataConUmId = {
      ...data,
      um_id: data.um_id ?? 1,
      moneda_id: data.moneda_id ?? 1, // Moneda por defecto: 1
    };

    // 2. Crear en SFactory
    let sfactoryResponse: SFactoryItemCreateResponse;
    try {
      sfactoryResponse = await sfactoryService.crearItem(dataConUmId);
    } catch (error: any) {
      // Si SFactory rechaza por código duplicado, dar mensaje claro
      if (error.message && (error.message.includes('duplicado') || error.message.includes('existe') || error.message.includes('ya existe'))) {
        throw new Error(
          `El código "${data.codigo || 'proporcionado'}" ya existe en SFactory. Por favor sincroniza los productos primero.`
        );
      }
      throw error;
    }

    // 2. Obtener el código del producto creado
    let codigo: string;

    if (sfactoryResponse.codigo || sfactoryResponse.Codigo) {
      codigo = (sfactoryResponse.codigo || sfactoryResponse.Codigo) as string;
    } else if (sfactoryResponse.id) {
      // Si solo tenemos el ID, leer el producto para obtener el código
      try {
        const productoCompleto = await sfactoryService.leerItem({ item_id: sfactoryResponse.id });
        codigo = productoCompleto.Codigo || productoCompleto.codigo || '';
        if (!codigo) {
          throw new Error('No se pudo obtener el código del producto creado');
        }
      } catch (error) {
        throw new Error(`Error al leer el producto creado: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    } else if (data.codigo) {
      codigo = data.codigo;
    } else {
      throw new Error('No se pudo obtener el código del producto creado');
    }

    // 3. Intentar leer el producto completo desde SFactory para sincronizar
    // Si no se puede leer, usar los datos de la respuesta de creación
    let productoCompleto: SFactoryProduct | undefined;

    try {
      productoCompleto = await sfactoryService.leerItem({ codigo });
      // CRÍTICO: Asegurar que rubro_id y subrubro_id estén presentes
      // SFactory puede no devolver estos campos al leer, así que usamos los valores originales enviados
      if (data.rubro_id) {
        (productoCompleto as any).rubro_id = (productoCompleto as any).rubro_id || (productoCompleto as any).RubroId || data.rubro_id;
      }
      if (data.subrubro_id) {
        (productoCompleto as any).subrubro_id = (productoCompleto as any).subrubro_id || (productoCompleto as any).SubrubroId || data.subrubro_id;
      }
    } catch (error) {
      // Si leerItem falla, usar la respuesta de creación directamente
      // o construir un objeto básico con los datos que tenemos
      console.warn(`[ProductoService.crearProducto] No se pudo leer el producto ${codigo} desde SFactory, usando datos de creación`);
      // Construir objeto básico desde data y sfactoryResponse
      // CRÍTICO: Incluir rubro_id y subrubro_id para que se guarden correctamente
      productoCompleto = {
        Codigo: codigo,
        Descripcion: data.descripcion || data.descrip_corta || '',
        Tipo: data.tipo || 'P',
        PrecioCosto: data.precio_costo || null,
        PrecioVenta: data.precio_venta || null,
        id: sfactoryResponse.id || null,
        rubro_id: data.rubro_id || null,
        subrubro_id: data.subrubro_id || null,
      } as SFactoryProduct;
    }

    // 4. Sincronizar incrementalmente (reutiliza TODO el parsing)
    await productoSyncService.syncProductoIncremental(codigo, empresaId, productoCompleto);

    // 5. Retornar producto local actualizado
    const producto = await this.getByCodigoAgrupacion(codigo, empresaId);
    if (!producto) {
      throw new Error('Producto creado pero no se pudo recuperar');
    }

    return producto;
  }

  /**
   * Actualizar producto en SFactory y sincronizar incrementalmente
   */
  async actualizarProducto(
    itemId: number,
    data: SFactoryItemEditData,
    empresaId: number
  ): Promise<ProductoPadreConVariantes> {
    if (data.rubro_id != null && !isRubroPermitidoEcommerce(data.rubro_id)) {
      throw new Error(
        'Solo se permiten rubros PRODUCTO WORKWEAR (3285) y PRODUCTO OFFICE (3314).'
      );
    }

    // No enviar descripcion a SFactory en actualización: solo lecturas (el sync usa la descripción de SFactory para el padre).
    const dataParaSFactory = { ...data };
    delete (dataParaSFactory as Record<string, unknown>).descripcion;

    // 1. Actualizar en SFactory
    await sfactoryService.editarItem(dataParaSFactory as SFactoryItemEditData);

    // 2. Obtener el código del producto
    let codigo: string;

    if (data.codigo) {
      codigo = data.codigo;
    } else {
      // Buscar en BD local
      const productoLocal = await prisma.productoWeb.findFirst({
        where: {
          empresaId,
          sfactoryId: itemId,
        },
      });
      if (!productoLocal) {
        throw new Error('No se pudo determinar el código del producto');
      }
      codigo = productoLocal.sfactoryCodigo;
    }

    // 3. Intentar leer el producto actualizado desde SFactory
    let productoCompleto: SFactoryProduct;
    try {
      productoCompleto = await sfactoryService.leerItem({ codigo });
    } catch (error) {
      // Si leerItem falla, construir objeto básico desde data
      console.warn(`[ProductoService.actualizarProducto] No se pudo leer el producto ${codigo} desde SFactory, usando datos de actualización`);
      productoCompleto = {
        Codigo: codigo,
        Descripcion: data.descripcion || data.descrip_corta || '',
        Tipo: data.tipo || 'P',
        PrecioCosto: data.precio_costo || null,
        PrecioVenta: data.precio_venta || null,
        id: itemId,
        rubro_id: data.rubro_id || null,
        subrubro_id: data.subrubro_id || null,
      } as SFactoryProduct;
    }

    // 4. Sincronizar incrementalmente (reutiliza TODO el parsing)
    await productoSyncService.syncProductoIncremental(codigo, empresaId, productoCompleto);

    // 5. Retornar producto local actualizado
    const producto = await this.getByCodigoAgrupacion(codigo, empresaId);
    if (!producto) {
      throw new Error('Producto actualizado pero no se pudo recuperar');
    }

    return producto;
  }

  /**
   * Helper para obtener producto por código de agrupación
   */
  private async getByCodigoAgrupacion(codigo: string, empresaId: number): Promise<ProductoPadreConVariantes | null> {
    const codigoAgrupacion = extraerCodigoAgrupacion(codigo);

    return prisma.productoPadre.findUnique({
      where: {
        unique_empresa_agrupacion: {
          empresaId,
          codigoAgrupacion,
        },
      },
      include: {
        productosWeb: {
          orderBy: [
            { color: 'asc' },
            { talle: 'asc' },
          ],
        },
        rubro: {
          select: {
            id: true,
            nombre: true,
            slug: true,
          },
        },
        subrubro: {
          select: {
            id: true,
            nombre: true,
            slug: true,
          },
        },
      },
    }) as Promise<ProductoPadreConVariantes | null>;
  }

  async update(
    id: number,
    data: {
      destacado?: boolean;
      publicado?: boolean;
      nombre?: string;
      descripcion?: string;
      [key: string]: any;
    }
  ): Promise<ProductoPadreConVariantes | null> {
    const updateData: Prisma.ProductoPadreUpdateInput = {};

    if (data.destacado !== undefined) {
      updateData.destacado = data.destacado;
    }
    if (data.publicado !== undefined) {
      updateData.publicado = data.publicado;
    }
    if (data.nombre !== undefined) {
      updateData.nombre = data.nombre;
    }
    if (data.descripcion !== undefined) {
      updateData.descripcion = data.descripcion;
    }

    await prisma.productoPadre.update({
      where: { id },
      data: updateData,
    });

    return this.getById(id, false);
  }

  async delete(id: number): Promise<void> {
    await prisma.productoPadre.delete({
      where: { id },
    });
  }

  /**
   * Actualiza el campo publicado de múltiples productos
   */
  async bulkUpdatePublicado(ids: number[], publicado: boolean): Promise<{ count: number }> {
    const result = await prisma.productoPadre.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        publicado,
      },
    });
    return { count: result.count };
  }

  /**
   * Actualiza el campo destacado de múltiples productos
   */
  async bulkUpdateDestacado(ids: number[], destacado: boolean): Promise<{ count: number }> {
    const result = await prisma.productoPadre.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        destacado,
      },
    });
    return { count: result.count };
  }

  /**
   * Obtiene productos activos para el ecommerce (público)
   * Solo devuelve productos publicados con al menos una variante activa
   * Optimizado para el frontend del cliente
   */
  async getActivos(
    params: ProductoActivoQueryParams
  ): Promise<PaginatedResponse<ProductoPadreConVariantes>> {
    // Validar empresaId
    if (!params.empresaId || params.empresaId <= 0) {
      throw new Error('empresaId es requerido y debe ser un número positivo');
    }

    // Validar límite de paginación
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const page = Math.max(params.page || 1, 1);
    const skip = (page - 1) * limit;

    const rubroIdsEcommerce = await this.getRubroIdsEcommerce(params.empresaId);

    const rubroFilter =
      params.rubroId != null
        ? params.rubroId
        : rubroIdsEcommerce.length > 0
          ? { in: rubroIdsEcommerce }
          : undefined;

    // Construir where clause - SOLO productos publicados y solo rubros ecommerce (si hay)
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
      publicado: true, // SOLO productos publicados
      ...(rubroFilter !== undefined && { rubroId: rubroFilter }),
      // Solo productos que tengan al menos una variante activa
      productosWeb: {
        some: {
          activoSfactory: true,
        },
      },
      // Filtros opcionales
      ...(params.destacado !== undefined && {
        destacado: params.destacado,
      }),
      ...(params.subrubroId && {
        subrubroId: params.subrubroId,
      }),
      ...((params.genero || params.sexo) && {
        genero: (params.genero || params.sexo) as string,
      }),
      // Búsqueda en nombre, descripción y código (case-insensitive en MySQL por collation)
      ...(params.search && {
        OR: [
          {
            nombre: {
              contains: params.search,
            },
          },
          {
            descripcion: {
              contains: params.search,
            },
          },
          {
            descripcionCorta: {
              contains: params.search,
            },
          },
          {
            codigoAgrupacion: {
              contains: params.search,
            },
          },
        ],
      }),
    };

    // Ordenamiento
    const orderBy: Prisma.ProductoPadreOrderByWithRelationInput[] = [];

    if (params.sortBy === 'destacado') {
      orderBy.push({ destacado: params.sortOrder || 'desc' });
    }
    if (params.sortBy === 'nombre') {
      orderBy.push({ nombre: params.sortOrder || 'asc' });
    }
    if (params.sortBy === 'orden') {
      orderBy.push({ orden: params.sortOrder || 'asc' });
    }

    // Orden por defecto: destacados primero, luego por orden
    if (orderBy.length === 0) {
      orderBy.push(
        { destacado: 'desc' },
        { orden: 'asc' },
        { nombre: 'asc' }
      );
    } else {
      // Si hay orden personalizado, agregar orden por defecto como secundario
      orderBy.push({ orden: 'asc' }, { nombre: 'asc' });
    }

    // Include optimizado para ecommerce
    const include: Prisma.ProductoPadreInclude = {
      // Solo variantes activas, ordenadas
      productosWeb: {
        where: {
          activoSfactory: true,
        },
        orderBy: [
          { color: 'asc' },
          { talle: 'asc' },
        ],
        // Solo campos necesarios para ecommerce
        select: {
          id: true,
          sfactoryCodigo: true,
          nombre: true,
          sexo: true,
          talle: true,
          color: true,
          precioCache: true,
          stockCache: true,
          imagenVariante: true,
        },
      },
      // Rubro y subrubro (solo datos públicos)
      rubro: {
        where: {
          visibleWeb: true,
        },
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      subrubro: {
        where: {
          visibleWeb: true,
        },
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      // Contar solo variantes activas
      _count: {
        select: {
          productosWeb: {
            where: {
              activoSfactory: true,
            },
          },
        },
      },
    };

    // Obtener total de registros
    const total = await prisma.productoPadre.count({ where });

    // Obtener datos paginados
    const data = await prisma.productoPadre.findMany({
      where,
      include,
      orderBy,
      skip,
      take: limit,
    }) as ProductoPadreConVariantes[];

    // Filtrar productos que no tengan variantes activas (por si acaso)
    const dataFiltrada = data.filter(
      (producto: ProductoPadreConVariantes) =>
        producto.productosWeb &&
        producto.productosWeb.length > 0
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: dataFiltrada,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Obtiene productos publicados con estructura optimizada para ecommerce
   * Retorna datos pre-procesados listos para renderizar en el frontend
   * empresaId debe ser proporcionado internamente (no es un parámetro público)
   */
  async getPublicadosOptimizado(
    params: ProductoPublicadoQueryParams
  ): Promise<ProductosPublicadosResponse> {
    // Validar empresaId (debe venir del controller, no del query público)
    if (!params.empresaId || params.empresaId <= 0) {
      throw new Error('empresaId es requerido internamente');
    }

    // Validar límite de paginación
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const page = Math.max(params.page || 1, 1);
    const skip = (page - 1) * limit;

    const rubroIdsEcommerce = await this.getRubroIdsEcommerce(params.empresaId);

    // Si no hay rubros ecommerce configurados, no filtrar por rubro (mostrar todos los publicados)
    const rubroFilter =
      params.rubroId != null
        ? params.rubroId
        : rubroIdsEcommerce.length > 0
          ? { in: rubroIdsEcommerce }
          : undefined;

    // "TODOS" = no filtrar por genero/sexo (valor del front para "todos los géneros")
    const generoOSexo = params.genero || params.sexo;
    const filtrarPorGenero =
      generoOSexo &&
      String(generoOSexo).toUpperCase() !== 'TODOS' &&
      String(generoOSexo).trim() !== '';

    // Construir where clause - SOLO productos publicados y solo rubros ecommerce (si hay)
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
      publicado: true, // SOLO productos publicados
      ...(rubroFilter !== undefined && { rubroId: rubroFilter }),
      // Solo productos que tengan al menos una variante activa
      productosWeb: {
        some: {
          activoSfactory: true,
          // Filtros adicionales en variantes
          ...(params.tieneStock && {
            stockCache: { gt: 0 },
          }),
          ...(filtrarPorGenero && {
            sexo: (generoOSexo as string).trim(),
          }),
          ...(params.color && {
            color: params.color,
          }),
          ...(params.talle && {
            talle: params.talle,
          }),
        },
      },
      // Filtros opcionales
      ...(params.destacado !== undefined && {
        destacado: params.destacado,
      }),
      ...(params.subrubroId && {
        subrubroId: params.subrubroId,
      }),
      ...(filtrarPorGenero && {
        genero: (generoOSexo as string).trim(),
      }),
      // Búsqueda
      ...(params.search && {
        OR: [
          { nombre: { contains: params.search } },
          { descripcion: { contains: params.search } },
          { descripcionCorta: { contains: params.search } },
          { codigoAgrupacion: { contains: params.search } },
        ],
      }),
    };

    // Ordenamiento
    const orderBy: Prisma.ProductoPadreOrderByWithRelationInput[] = [];

    if (params.sortBy === 'destacado') {
      orderBy.push({ destacado: params.sortOrder || 'desc' });
    } else if (params.sortBy === 'nombre') {
      orderBy.push({ nombre: params.sortOrder || 'asc' });
    } else if (params.sortBy === 'precio') {
      // Ordenar por precio requiere un subquery más complejo, por ahora usar orden
      orderBy.push({ orden: params.sortOrder || 'asc' });
    } else {
      // Orden por defecto
      orderBy.push({ destacado: 'desc' }, { orden: 'asc' }, { nombre: 'asc' });
    }

    // Include optimizado - traer SOLO lo necesario con selects específicos
    // Sin where en rubro/subrubro para no excluir productos cuyo rubro tenga visibleWeb: false (como en admin)
    const include: Prisma.ProductoPadreInclude = {
      rubro: {
        select: { id: true, nombre: true, slug: true },
      },
      subrubro: {
        select: { id: true, nombre: true, slug: true },
      },
      productosWeb: {
        where: {
          activoSfactory: true,
          ...(filtrarPorGenero && { sexo: (generoOSexo as string).trim() }),
          ...(params.color && { color: params.color }),
          ...(params.talle && { talle: params.talle }),
          ...(params.tieneStock && { stockCache: { gt: 0 } }),
        },
        orderBy: [{ color: 'asc' }, { talle: 'asc' }],
        // OPTIMIZACIÓN: Include con selects específicos en niveles anidados para reducir datos
        include: {
          imagenes: {
            orderBy: { orden: 'asc' },
            take: 1,
            select: { imagenUrl: true },
          },
          precios: {
            where: {
              tipoCliente: 'minorista',
            },
            take: 1,
            select: {
              precioLista: true,
              precioTransfer: true,
              precioFinanciado: true,
              precioSinImp: true,
            },
          },
        },
        // Nota: ProductoWeb trae todos sus campos, pero los includes anidados están optimizados
      },
    };

    // Obtener total de registros
    const total = await prisma.productoPadre.count({ where });

    // Obtener datos paginados
    const productos = await prisma.productoPadre.findMany({
      where,
      include,
      orderBy,
      skip,
      take: limit,
    });

    // Transformar a estructura optimizada
    const productosFormateados: ProductoPublicado[] = productos
      .filter((p: any) => p.productosWeb && p.productosWeb.length > 0)
      .map((producto: any): ProductoPublicado => {
        // Type assertion para acceder a las propiedades
        const p = producto as any;
        const variantesActivas = p.productosWeb || [];

        // Obtener precios de ProductoPrecio si están disponibles, sino usar precioCache
        const preciosProductoPrecio = variantesActivas
          .flatMap((v: any) => v.precios || [])
          .filter((p: any): boolean => Number(p.precioLista) > 0);

        const preciosCache = variantesActivas
          .map((v: any): number => Number(v.precioCache || 0))
          .filter((p: number): boolean => p > 0);

        // Priorizar precios de ProductoPrecio, sino usar precioCache
        let precioLista: number | null = null;
        let precioTransfer: number | null = null;
        let precio3Cuotas: number | null = null;
        let precioSinImp: number | null = null;

        if (preciosProductoPrecio.length > 0) {
          // Usar precios de ProductoPrecio (ya calculados)
          const precioMinPrecio = Math.min(...preciosProductoPrecio.map((p: any): number => Number(p.precioLista)));
          const precioObj = preciosProductoPrecio.find((p: any): boolean => Number(p.precioLista) === precioMinPrecio);

          if (precioObj) {
            precioLista = Number(precioObj.precioLista);
            precioTransfer = precioObj.precioTransfer ? Number(precioObj.precioTransfer) : null;
            precio3Cuotas = precioObj.precioFinanciado ? Number(precioObj.precioFinanciado) : null;
            precioSinImp = precioObj.precioSinImp ? Number(precioObj.precioSinImp) : null;
          }
        } else if (preciosCache.length > 0) {
          // Fallback: usar precioCache y calcular derivados con precios.config
          precioLista = Math.min(...preciosCache);
          const derivados = calcularTodosLosPrecios(precioLista, CUOTAS_FINANCIADO_DEFAULT);
          precioTransfer = derivados.precioTransfer;
          precio3Cuotas = derivados.precioFinanciado;
          precioSinImp = derivados.precioSinImp;
        }

        const precioMin = preciosCache.length > 0 ? Math.min(...preciosCache) : precioLista;
        const precioMax = preciosCache.length > 0 ? Math.max(...preciosCache) : precioLista;

        // Seleccionar imagen principal (priorizar variante con imagen)
        let imagenPrincipal: string | null = null;
        const varianteConImagen = variantesActivas.find(
          (v: any) => v.imagenes && v.imagenes.length > 0
        );
        if (varianteConImagen?.imagenes?.[0]?.imagenUrl) {
          imagenPrincipal = varianteConImagen.imagenes[0].imagenUrl;
        } else if (varianteConImagen?.imagenVariante) {
          imagenPrincipal = varianteConImagen.imagenVariante;
        } else if (p.imagenes && typeof p.imagenes === 'object') {
          const imagenesArray = Array.isArray(p.imagenes)
            ? p.imagenes
            : Object.values(p.imagenes);
          if (imagenesArray.length > 0 && typeof imagenesArray[0] === 'string') {
            imagenPrincipal = imagenesArray[0];
          }
        }

        // Crear mapa de imágenes por color (todas las variantes del mismo color usan la misma imagen)
        const imagenesPorColor = new Map<string, string | null>();

        variantesActivas.forEach((v: any): void => {
          if (v.color && !imagenesPorColor.has(v.color)) {
            // Buscar primera variante de este color con imagen
            const varianteConImagen = variantesActivas.find(
              (v2: any): boolean => v2.color === v.color &&
                (v2.imagenes?.[0]?.imagenUrl || v2.imagenVariante)
            );

            const imagen = varianteConImagen?.imagenes?.[0]?.imagenUrl ||
              varianteConImagen?.imagenVariante ||
              null;
            imagenesPorColor.set(v.color, imagen);
          }
        });

        // Variantes simplificadas
        const variantes: VariantePublicada[] = variantesActivas.map((v: any): VariantePublicada => {
          const imagenColor = v.color ? imagenesPorColor.get(v.color) || null : null;

          return {
            id: v.id,
            codigo: v.sfactoryCodigo,
            color: v.color,
            talle: v.talle,
            // sexo eliminado - se hereda del producto padre
            stock: Number(v.stockCache || 0),
            precio: Number(v.precioCache || 0),
            imagen: imagenColor, // Imagen por color, no por variante individual
            tieneImagen: !!imagenColor,
          };
        });

        // Agregados
        const colores = Array.from(
          new Set(
            variantesActivas
              .map((v: any): string | null => v.color)
              .filter((c: string | null): c is string => !!c)
          )
        ).sort();

        const talles = Array.from(
          new Set(
            variantesActivas
              .map((v: any): string | null => v.talle)
              .filter((t: string | null): t is string => !!t)
          )
        ).sort();

        const stockTotal = variantesActivas.reduce(
          (sum: number, v: any): number => sum + Number(v.stockCache || 0),
          0
        );

        // Obtener sexo común de todas las variantes (las variantes heredan el sexo del producto padre)
        // Si todas las variantes tienen el mismo sexo, usar ese. Si no, usar null.
        const sexos = variantesActivas
          .map((v: any): string | null => v.sexo)
          .filter((s: string | null): s is string => !!s);
        const sexoUnico: string | null = sexos.length > 0 && new Set(sexos).size === 1
          ? (sexos[0] ?? null)
          : null;

        return {
          id: p.id,
          codigoAgrupacion: p.codigoAgrupacion,
          slug: p.slug,
          nombre: p.nombre,
          descripcion: p.descripcion,
          descripcionCorta: p.descripcionCorta,
          destacado: p.destacado,
          orden: p.orden,
          sexo: (p as any).genero ?? sexoUnico, // Preferir genero del padre; fallback a variantes
          rubro: p.rubro && p.rubro.slug
            ? {
              id: p.rubro.id,
              nombre: p.rubro.nombre,
              slug: p.rubro.slug,
            }
            : null,
          subrubro: p.subrubro && p.subrubro.slug
            ? {
              id: p.subrubro.id,
              nombre: p.subrubro.nombre,
              slug: p.subrubro.slug,
            }
            : null,
          imagenPrincipal,
          precioLista,
          precioTransfer,
          precio3Cuotas,
          precioSinImp,
          variantes,
          colores: colores as string[],
          talles: talles as string[],
          totalVariantes: variantesActivas.length,
          tieneStock: stockTotal > 0,
          stockTotal,
          precioMin,
          precioMax,
        };
      });

    const totalPages = Math.ceil(total / limit);

    return {
      data: productosFormateados,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Obtiene productos destacados publicados
   * Reutiliza getPublicadosOptimizado con destacado: true
   */
  async getDestacados(
    params: Omit<ProductoPublicadoQueryParams, 'destacado'>
  ): Promise<ProductosPublicadosResponse> {
    return this.getPublicadosOptimizado({
      ...params,
      destacado: true, // Siempre filtrar por destacados
    });
  }

  /**
   * Validar si un código existe en la base de datos local
   * Busca en productos_sfactory (fuente de verdad sincronizada desde SFactory)
   */
  async validarCodigo(codigo: string, empresaId: number): Promise<{
    existe: boolean;
    disponible: boolean;
    codigo: string;
    mensaje?: string;
  }> {
    // Usar findFirst en lugar de findUnique para evitar problemas con nombres de constraints
    const producto = await prisma.productoSfactory.findFirst({
      where: {
        empresaId,
        codigo,
      },
    });

    if (producto) {
      return {
        existe: true,
        disponible: false,
        codigo,
        mensaje: 'Este código ya existe en la base de datos',
      };
    }

    return {
      existe: false,
      disponible: true,
      codigo,
    };
  }

  /**
   * Obtener variantes de un código base y calcular siguiente número sugerido
   */
  async obtenerVariantesPorCodigoBase(
    codigoBase: string,
    empresaId: number
  ): Promise<{
    codigoBase: string;
    variantes: Array<{
      codigo: string;
      talle: string | null;
      color: string | null;
      numero: number;
    }>;
    ultimoNumero: number;
    siguienteSugerido: number;
    productoPadre: {
      id: number;
      nombre: string;
      sexo: string | null;
    } | null;
  }> {
    // Buscar producto padre por código base
    const productoPadre = await prisma.productoPadre.findUnique({
      where: {
        unique_empresa_agrupacion: {
          empresaId,
          codigoAgrupacion: codigoBase,
        },
      },
      select: {
        id: true,
        nombre: true,
        productosWeb: {
          where: {
            activoSfactory: true,
          },
          select: {
            sfactoryCodigo: true,
            talle: true,
            color: true,
            sexo: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    if (!productoPadre) {
      return {
        codigoBase,
        variantes: [],
        ultimoNumero: 0,
        siguienteSugerido: 1,
        productoPadre: null,
      };
    }

    // Preferir genero del padre; fallback a primera variante
    const sexo = (productoPadre as any).genero ?? productoPadre.productosWeb[0]?.sexo ?? null;

    // Extraer números de variantes
    const variantes = productoPadre.productosWeb.map((pw) => {
      const codigo = pw.sfactoryCodigo;
      const match = codigo.match(/(\d+)$/);
      const numero = match && match[1] ? parseInt(match[1], 10) : 0;

      return {
        codigo,
        talle: pw.talle,
        color: pw.color,
        numero,
      };
    });

    // Ordenar por número y obtener el último
    variantes.sort((a, b) => a.numero - b.numero);
    const ultimaVariante = variantes.length > 0 ? variantes[variantes.length - 1] : undefined;
    const ultimoNumero = ultimaVariante ? ultimaVariante.numero : 0;
    const siguienteSugerido = ultimoNumero + 1;

    return {
      codigoBase,
      variantes,
      ultimoNumero,
      siguienteSugerido,
      productoPadre: {
        id: productoPadre.id,
        nombre: productoPadre.nombre,
        sexo,
      },
    };
  }

  /**
   * Obtener combinaciones Talle+Color existentes de un producto padre
   */
  async obtenerCombinaciones(
    productoPadreId: number,
    empresaId: number
  ): Promise<{
    combinaciones: Array<{ talle: string | null; color: string | null }>;
    total: number;
  }> {
    const variantes = await prisma.productoWeb.findMany({
      where: {
        productoPadreId,
        empresaId,
        activoSfactory: true,
      },
      select: {
        talle: true,
        color: true,
      },
    });

    // Crear combinaciones únicas
    const combinacionesMap = new Map<string, { talle: string | null; color: string | null }>();
    variantes.forEach((v) => {
      const key = `${v.talle || ''}_${v.color || ''}`;
      if (!combinacionesMap.has(key)) {
        combinacionesMap.set(key, {
          talle: v.talle,
          color: v.color,
        });
      }
    });

    const combinaciones = Array.from(combinacionesMap.values());

    return {
      combinaciones,
      total: combinaciones.length,
    };
  }

  /**
   * Buscar productos padre para crear variantes
   */
  async buscarProductosPadre(params: {
    empresaId: number;
    nombre?: string;
    sexo?: string;
    rubroId?: number;
    limit?: number;
  }): Promise<{
    productos: Array<{
      id: number;
      nombre: string;
      sexo: string | null;
      codigoAgrupacion: string;
      rubro: { id: number; nombre: string } | null;
      variantesCount: number;
    }>;
    total: number;
  }> {
    // Construir condiciones de búsqueda por nombre/código
    // Buscar por: nombre, descripción, código de agrupación, y códigos individuales de variantes (SKU)
    const nombreConditions: Prisma.ProductoPadreWhereInput[] = params.nombre
      ? [
        {
          nombre: {
            contains: params.nombre,
          },
        },
        {
          descripcion: {
            contains: params.nombre,
          },
        },
        {
          codigoAgrupacion: {
            contains: params.nombre,
          },
        },
        {
          productosWeb: {
            some: {
              sfactoryCodigo: {
                contains: params.nombre,
              },
              ...(params.sexo && {
                sexo: params.sexo,
              }),
            },
          },
        },
      ]
      : [];

    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
      ...(params.nombre && {
        OR: nombreConditions,
      }),
      // Si hay filtro de sexo, aplicarlo a todas las variantes del producto
      // Esto asegura que solo se muestren productos que tienen variantes con ese sexo
      ...(params.sexo && {
        productosWeb: {
          some: {
            sexo: params.sexo,
          },
        },
      }),
      ...(params.rubroId && {
        rubroId: params.rubroId,
      }),
    };

    const [productos, total] = await Promise.all([
      prisma.productoPadre.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          codigoAgrupacion: true,
          rubro: {
            select: {
              id: true,
              nombre: true,
            },
          },
          productosWeb: {
            select: {
              id: true,
              sexo: true,
            },
          },
        },
        take: params.limit || 50,
        orderBy: {
          nombre: 'asc',
        },
      }),
      prisma.productoPadre.count({ where }),
    ]);

    // Preferir genero del padre; fallback a primera variante
    const productosConSexo = productos.map((p) => {
      const primeraVariante = p.productosWeb[0];
      const generoPadre = (p as any).genero;
      return {
        id: p.id,
        nombre: p.nombre,
        sexo: generoPadre ?? primeraVariante?.sexo ?? null,
        codigoAgrupacion: p.codigoAgrupacion,
        rubro: p.rubro,
        variantesCount: p.productosWeb.length,
      };
    });

    return {
      productos: productosConSexo,
      total,
    };
  }

  /**
   * Obtener datos plantilla para pre-llenar formulario de variante
   */
  async obtenerDatosPlantilla(
    productoPadreId: number,
    empresaId: number
  ): Promise<{
    datosSFactory: any;
    datosLocales: {
      nombre: string;
      descripcion: string | null;
      descripcionCorta: string | null;
      descripcionMarketing: string | null;
      destacado: boolean;
    };
    primeraVariante: {
      talle: string | null;
      color: string | null;
    };
  }> {
    // Obtener producto padre
    const productoPadre = await prisma.productoPadre.findUnique({
      where: {
        id: productoPadreId,
      },
      select: {
        nombre: true,
        descripcion: true,
        descripcionCorta: true,
        descripcionMarketing: true,
        destacado: true,
        rubroId: true,
        subrubroId: true,
      },
    });

    if (!productoPadre) {
      throw new Error('Producto padre no encontrado');
    }

    // Obtener primera variante
    const primeraVariante = await prisma.productoWeb.findFirst({
      where: {
        productoPadreId,
        empresaId,
        activoSfactory: true,
      },
      select: {
        sfactoryCodigo: true,
        talle: true,
        color: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    if (!primeraVariante) {
      throw new Error('No se encontró ninguna variante del producto');
    }

    // Obtener rubro y subrubro con sfactoryId
    let rubroSfactoryId: number | null = null;
    let subrubroSfactoryId: number | null = null;

    if (productoPadre.rubroId) {
      const rubro = await prisma.rubro.findUnique({
        where: { id: productoPadre.rubroId },
        select: { sfactoryId: true },
      });
      rubroSfactoryId = rubro?.sfactoryId || null;
    }

    if (productoPadre.subrubroId) {
      const subrubro = await prisma.subrubro.findUnique({
        where: { id: productoPadre.subrubroId },
        select: { sfactoryId: true },
      });
      subrubroSfactoryId = subrubro?.sfactoryId || null;
    }

    console.log('DEBUG obtenerDatosPlantilla:', {
      productoPadreId,
      empresaId,
      empresaIdType: typeof empresaId,
      sfactoryCodigo: primeraVariante.sfactoryCodigo,
      sfactoryCodigoLength: primeraVariante.sfactoryCodigo?.length,
      sfactoryCodigoHex: primeraVariante.sfactoryCodigo ? Buffer.from(primeraVariante.sfactoryCodigo).toString('hex') : null
    });

    // Obtener datos SFactory desde productos_sfactory
    // Usar findFirst en lugar de findUnique para evitar problemas con nombres de constraints
    // y porque el registro puede no existir si no se ha sincronizado desde SFactory
    const productoSfactory = await prisma.productoSfactory.findFirst({
      where: {
        empresaId,
        codigo: primeraVariante.sfactoryCodigo,
      },
      select: {
        tipo: true,
        descripcion: true,
        descrip_corta: true,
        detalle: true,
        precio_costo: true,
        precio_venta: true,
        utilidad_planificada: true,
        iva: true,
        stock_minimo: true,
        stock_maximo: true,
        stockeable: true,
        item_compra: true,
        item_venta: true,
        item_alquiler: true,
        um_id: true, // Incluir um_id
        um_compra_id: true,
        item_lote: true,
        item_serie: true,
        // usa_vencimiento, clase_id, linea_id, moneda_id no existen en el schema
        cta_ingresos_id: true,
        cta_costo_venta_id: true,
        cta_egresos_id: true,
        barcode: true,
        ctb_id: true,
      },
    });

    if (!productoSfactory) {
      throw new Error(
        `No se encontraron datos de SFactory para el producto. ` +
        `ProductoPadreId: ${productoPadreId}, EmpresaId: ${empresaId}, ` +
        `Código: ${primeraVariante.sfactoryCodigo}. ` +
        `El producto existe en productos_web pero no en productos_sfactory. ` +
        `Es posible que necesite sincronizarse desde SFactory.`
      );
    }

    // Mapear datos SFactory al formato esperado
    const datosSFactory = {
      tipo: productoSfactory.tipo || 'P',
      descripcion: productoSfactory.descripcion || productoSfactory.descrip_corta || '',
      descrip_corta: productoSfactory.descrip_corta || null,
      detalle: productoSfactory.detalle || null,
      precio_costo: productoSfactory.precio_costo ? Number(productoSfactory.precio_costo) : null,
      precio_venta: productoSfactory.precio_venta ? Number(productoSfactory.precio_venta) : null,
      moneda_id: null, // No existe en el schema
      utilidad_planificada: productoSfactory.utilidad_planificada ? Number(productoSfactory.utilidad_planificada) : null,
      iva: productoSfactory.iva ? Number(productoSfactory.iva) : null,
      stock_minimo: productoSfactory.stock_minimo ? Number(productoSfactory.stock_minimo) : null,
      stock_maximo: productoSfactory.stock_maximo ? Number(productoSfactory.stock_maximo) : null,
      rubro_id: rubroSfactoryId, // Heredado del producto padre
      subrubro_id: subrubroSfactoryId, // Heredado del producto padre
      stockeable: productoSfactory.stockeable === 'S' ? 1 : 0,
      item_compra: productoSfactory.item_compra === 'S' ? 1 : null,
      item_venta: productoSfactory.item_venta === 'S' ? 1 : null,
      item_alquiler: productoSfactory.item_alquiler === 'S' ? 1 : null,
      um_id: productoSfactory.um_id || 1, // Heredado del producto padre, por defecto 1 si no existe
      um_compra_id: productoSfactory.um_compra_id || null,
      usa_lote: productoSfactory.item_lote === 'S',
      usa_serie: productoSfactory.item_serie === 'S' ? 1 : 0,
      // usa_vencimiento, clase_id, linea_id, moneda_id no existen en el schema
      cta_ingresos_id: productoSfactory.cta_ingresos_id || null,
      cta_costo_venta_id: productoSfactory.cta_costo_venta_id || null,
      cta_egresos_id: productoSfactory.cta_egresos_id || null,
      barcode: productoSfactory.barcode || null,
      ctb_id: productoSfactory.ctb_id || null,
    };

    return {
      datosSFactory,
      datosLocales: {
        nombre: productoPadre.nombre,
        descripcion: productoPadre.descripcion,
        descripcionCorta: productoPadre.descripcionCorta,
        descripcionMarketing: productoPadre.descripcionMarketing,
        destacado: productoPadre.destacado,
      },
      primeraVariante: {
        talle: primeraVariante.talle,
        color: primeraVariante.color,
      },
    };
  }

  /**
   * Actualizar solo datos locales (no SFactory)
   */
  async actualizarDatosLocales(
    id: number,
    data: {
      descripcionMarketing?: string;
      descripcionCorta?: string;
      destacado?: boolean;
      nombre?: string;
      descripcion?: string;
    }
  ): Promise<ProductoPadreConVariantes> {
    const updateData: Prisma.ProductoPadreUpdateInput = {};

    if (data.descripcionMarketing !== undefined) {
      updateData.descripcionMarketing = data.descripcionMarketing;
    }
    if (data.descripcionCorta !== undefined) {
      updateData.descripcionCorta = data.descripcionCorta;
    }
    if (data.destacado !== undefined) {
      updateData.destacado = data.destacado;
    }
    if (data.nombre !== undefined) {
      updateData.nombre = data.nombre;
    }
    if (data.descripcion !== undefined) {
      updateData.descripcion = data.descripcion;
    }

    await prisma.productoPadre.update({
      where: { id },
      data: updateData,
    });

    return this.getById(id, true) as Promise<ProductoPadreConVariantes>;
  }

  /**
   * Actualizar datos de variante (Talle y Color)
   */
  async actualizarDatosVariante(
    productoWebId: number,
    data: {
      talle?: string | null;
      color?: string | null;
    },
    empresaId: number
  ): Promise<{
    id: number;
    talle: string | null;
    color: string | null;
    productoPadreId: number;
  }> {
    // Validar que la nueva combinación no exista en el mismo producto padre
    const variante = await prisma.productoWeb.findUnique({
      where: { id: productoWebId },
      select: {
        productoPadreId: true,
        talle: true,
        color: true,
      },
    });

    if (!variante) {
      throw new Error('Variante no encontrada');
    }

    // Si está cambiando talle o color, validar que no exista la combinación
    if (data.talle !== undefined || data.color !== undefined) {
      const nuevoTalle = data.talle !== undefined ? data.talle : variante.talle;
      const nuevoColor = data.color !== undefined ? data.color : variante.color;

      const combinacionExistente = await prisma.productoWeb.findFirst({
        where: {
          productoPadreId: variante.productoPadreId,
          empresaId,
          id: { not: productoWebId },
          talle: nuevoTalle,
          color: nuevoColor,
          activoSfactory: true,
        },
      });

      if (combinacionExistente) {
        throw new Error(
          `La combinación Talle "${nuevoTalle}" y Color "${nuevoColor}" ya existe en este producto`
        );
      }
    }

    await prisma.productoWeb.update({
      where: { id: productoWebId },
      data: {
        talle: data.talle !== undefined ? data.talle : undefined,
        color: data.color !== undefined ? data.color : undefined,
      },
    });

    const actualizado = await prisma.productoWeb.findUnique({
      where: { id: productoWebId },
      select: {
        id: true,
        talle: true,
        color: true,
        productoPadreId: true,
      },
    });

    if (!actualizado) {
      throw new Error('Error al actualizar la variante');
    }

    return actualizado;
  }

  /**
   * Obtener producto completo para edición (SFactory + Local + Variante)
   */
  async obtenerProductoCompleto(
    id: number,
    empresaId: number
  ): Promise<{
    datosSFactory: any;
    datosLocales: {
      id: number;
      nombre: string;
      descripcion: string | null;
      descripcionCorta: string | null;
      descripcionMarketing: string | null;
      destacado: boolean;
      rubroId: number | null;
      subrubroId: number | null;
    };
    variante: {
      id: number;
      talle: string | null;
      color: string | null;
      sfactoryCodigo: string;
      sfactoryId: number;
    } | null;
    productoPadre: {
      id: number;
      nombre: string;
      sexo: string | null;
      codigoAgrupacion: string;
    };
  }> {
    // Obtener producto padre
    const productoPadre = await prisma.productoPadre.findUnique({
      where: { id },
      include: {
        rubro: {
          select: {
            id: true,
            sfactoryId: true,
          },
        },
        subrubro: {
          select: {
            id: true,
            sfactoryId: true,
          },
        },
        productosWeb: {
          where: {
            empresaId,
            activoSfactory: true,
          },
          orderBy: {
            id: 'asc',
          },
          take: 1,
        },
      },
    });

    if (!productoPadre) {
      throw new Error('Producto no encontrado');
    }

    const primeraVariante = productoPadre.productosWeb[0];

    if (!primeraVariante) {
      throw new Error('No se encontró ninguna variante activa del producto');
    }

    // Obtener datos SFactory
    // Usar findFirst en lugar de findUnique para evitar problemas con nombres de constraints
    const productoSfactory = await prisma.productoSfactory.findFirst({
      where: {
        empresaId,
        codigo: primeraVariante.sfactoryCodigo,
      },
    });

    if (!productoSfactory) {
      throw new Error(
        `No se encontraron datos de SFactory para el producto. ` +
        `ProductoPadreId: ${productoPadre.id}, EmpresaId: ${empresaId}, ` +
        `Código: ${primeraVariante.sfactoryCodigo}. ` +
        `El producto existe en productos_web pero no en productos_sfactory. ` +
        `Es posible que necesite sincronizarse desde SFactory.`
      );
    }

    // Preferir genero del padre; fallback a primera variante
    const sexo = (productoPadre as any).genero ?? primeraVariante.sexo;

    // Mapear datos SFactory desde la tabla productos_sfactory
    const datosSFactory = {
      tipo: productoSfactory.tipo || 'P',
      descripcion: productoSfactory.descripcion || productoSfactory.descrip_corta || '',
      descrip_corta: productoSfactory.descrip_corta || null,
      detalle: productoSfactory.detalle || null,
      precio_costo: productoSfactory.precio_costo ? Number(productoSfactory.precio_costo) : null,
      precio_venta: productoSfactory.precio_venta ? Number(productoSfactory.precio_venta) : null,
      moneda_id: productoSfactory.moneda ? (productoSfactory.moneda === '1' ? 1 : productoSfactory.moneda === '2' ? 2 : null) : null,
      utilidad_planificada: productoSfactory.utilidad_planificada ? Number(productoSfactory.utilidad_planificada) : null,
      iva: productoSfactory.iva ? Number(productoSfactory.iva) : null,
      stock_minimo: productoSfactory.stock_minimo ? Number(productoSfactory.stock_minimo) : null,
      stock_maximo: productoSfactory.stock_maximo ? Number(productoSfactory.stock_maximo) : null,
      rubro_id: productoSfactory.rubro_id || productoPadre.rubro?.sfactoryId || null,
      subrubro_id: productoSfactory.subrubro_id || productoPadre.subrubro?.sfactoryId || null,
      stockeable: productoSfactory.stockeable === 'S' || productoSfactory.stockeable === '1' ? 1 : 0,
      item_compra: productoSfactory.item_compra === 'S' || productoSfactory.item_compra === '1' ? 1 : (productoSfactory.item_compra === 'N' || productoSfactory.item_compra === '0' ? 0 : null),
      item_venta: productoSfactory.item_venta === 'S' || productoSfactory.item_venta === '1' ? 1 : (productoSfactory.item_venta === 'N' || productoSfactory.item_venta === '0' ? 0 : null),
      item_alquiler: productoSfactory.item_alquiler === 'S' || productoSfactory.item_alquiler === '1' ? 1 : (productoSfactory.item_alquiler === 'N' || productoSfactory.item_alquiler === '0' ? 0 : null),
      um_id: productoSfactory.um_id || null,
      um_compra_id: productoSfactory.um_compra_id || null,
      usa_lote: productoSfactory.item_lote === 'S' || productoSfactory.item_lote === '1',
      usa_serie: productoSfactory.item_serie === 'S' || productoSfactory.item_serie === '1' ? 1 : 0,
      usa_vencimiento: null, // No está en el schema
      cta_ingresos_id: productoSfactory.cta_ingresos_id || null,
      cta_costo_venta_id: productoSfactory.cta_costo_venta_id || null,
      cta_egresos_id: productoSfactory.cta_egresos_id || null,
      barcode: productoSfactory.barcode || null,
      clase_id: null, // No está en el schema como ID
      linea_id: null, // No está en el schema como ID
      ctb_id: productoSfactory.ctb_id || null,
      item_id: productoSfactory.sfactory_id || null,
    };

    return {
      datosSFactory,
      datosLocales: {
        id: productoPadre.id,
        nombre: productoPadre.nombre,
        descripcion: productoPadre.descripcion,
        descripcionCorta: productoPadre.descripcionCorta,
        descripcionMarketing: productoPadre.descripcionMarketing,
        destacado: productoPadre.destacado,
        rubroId: productoPadre.rubroId,
        subrubroId: productoPadre.subrubroId,
      },
      variante: {
        id: primeraVariante.id,
        talle: primeraVariante.talle,
        color: primeraVariante.color,
        sfactoryCodigo: primeraVariante.sfactoryCodigo,
        sfactoryId: primeraVariante.sfactoryId,
      },
      productoPadre: {
        id: productoPadre.id,
        nombre: productoPadre.nombre,
        sexo: sexo,
        codigoAgrupacion: productoPadre.codigoAgrupacion,
      },
    };
  }
}

export const productoService = new ProductoService();

