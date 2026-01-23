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

export class ProductoService {
  async getAll(
    params: ProductoQueryParams
  ): Promise<PaginatedResponse<ProductoPadreConVariantes>> {
    const where: Prisma.ProductoPadreWhereInput = {
      ...(params.empresaId !== undefined && {
        empresaId: params.empresaId,
      }),
      ...(params.rubroId && {
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
      const found = allProducts.find(p => 
        p.slug && p.slug.toLowerCase().trim() === cleanSlug.toLowerCase()
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
            where: { orden: 1 },
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

    // Construir where clause - SOLO productos publicados
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
      publicado: true, // SOLO productos publicados
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
      ...(params.rubroId && {
        rubroId: params.rubroId,
      }),
      ...(params.subrubroId && {
        subrubroId: params.subrubroId,
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
      (producto) => 
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

    // Construir where clause - SOLO productos publicados
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
      publicado: true, // SOLO productos publicados
      // Solo productos que tengan al menos una variante activa
      productosWeb: {
        some: {
          activoSfactory: true,
          // Filtros adicionales en variantes
          ...(params.tieneStock && {
            stockCache: { gt: 0 },
          }),
          ...(params.sexo && {
            sexo: params.sexo,
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
      ...(params.rubroId && {
        rubroId: params.rubroId,
      }),
      ...(params.subrubroId && {
        subrubroId: params.subrubroId,
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

    // Include optimizado - traer TODO lo necesario en una query
    const include: Prisma.ProductoPadreInclude = {
      rubro: {
        where: { visibleWeb: true },
        select: { id: true, nombre: true, slug: true },
      },
      subrubro: {
        where: { visibleWeb: true },
        select: { id: true, nombre: true, slug: true },
      },
      productosWeb: {
        where: {
          activoSfactory: true,
          ...(params.sexo && { sexo: params.sexo }),
          ...(params.color && { color: params.color }),
          ...(params.talle && { talle: params.talle }),
          ...(params.tieneStock && { stockCache: { gt: 0 } }),
        },
        orderBy: [{ color: 'asc' }, { talle: 'asc' }],
        include: {
          imagenes: {
            where: { orden: 1 },
            take: 1,
            select: { imagenUrl: true },
          },
          precios: {
            where: {
              tipoCliente: 'minorista', // Por defecto usar precios minorista para ecommerce
            },
            take: 1,
          },
        },
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
      .filter((p) => p.productosWeb && p.productosWeb.length > 0)
      .map((producto) => {
        const variantesActivas = producto.productosWeb || [];
        
        // Obtener precios de ProductoPrecio si están disponibles, sino usar precioCache
        const preciosProductoPrecio = variantesActivas
          .flatMap((v) => (v as any).precios || [])
          .filter((p: any) => p.precioLista > 0);
        
        const preciosCache = variantesActivas
          .map((v) => Number(v.precioCache || 0))
          .filter((p) => p > 0);
        
        // Priorizar precios de ProductoPrecio, sino usar precioCache
        let precioLista: number | null = null;
        let precioTransfer: number | null = null;
        let precio3Cuotas: number | null = null;
        let precioSinImp: number | null = null;
        
        if (preciosProductoPrecio.length > 0) {
          // Usar precios de ProductoPrecio (ya calculados)
          const precioMinPrecio = Math.min(...preciosProductoPrecio.map((p) => Number(p.precioLista)));
          const precioObj = preciosProductoPrecio.find((p) => Number(p.precioLista) === precioMinPrecio);
          
          if (precioObj) {
            precioLista = Number(precioObj.precioLista);
            precioTransfer = precioObj.precioTransfer ? Number(precioObj.precioTransfer) : null;
            precio3Cuotas = precioObj.precioFinanciado ? Number(precioObj.precioFinanciado) : null;
            precioSinImp = precioObj.precioSinImp ? Number(precioObj.precioSinImp) : null;
          }
        } else if (preciosCache.length > 0) {
          // Fallback: usar precioCache y calcular derivados
          precioLista = Math.min(...preciosCache);
          // Los precios derivados se calcularán usando las constantes si es necesario
          // Por ahora dejamos null si no hay ProductoPrecio
        }
        
        const precioMin = preciosCache.length > 0 ? Math.min(...preciosCache) : precioLista;
        const precioMax = preciosCache.length > 0 ? Math.max(...preciosCache) : precioLista;
        
        // Seleccionar imagen principal (priorizar variante con imagen)
        let imagenPrincipal: string | null = null;
        const varianteConImagen = variantesActivas.find(
          (v) => (v as any).imagenes && (v as any).imagenes.length > 0
        );
        if ((varianteConImagen as any)?.imagenes?.[0]?.imagenUrl) {
          imagenPrincipal = (varianteConImagen as any).imagenes[0].imagenUrl;
        } else if (varianteConImagen?.imagenVariante) {
          imagenPrincipal = varianteConImagen.imagenVariante;
        } else if (producto.imagenes && typeof producto.imagenes === 'object') {
          const imagenesArray = Array.isArray(producto.imagenes) 
            ? producto.imagenes 
            : Object.values(producto.imagenes);
          if (imagenesArray.length > 0 && typeof imagenesArray[0] === 'string') {
            imagenPrincipal = imagenesArray[0];
          }
        }
        
        // Crear mapa de imágenes por color (todas las variantes del mismo color usan la misma imagen)
        const imagenesPorColor = new Map<string, string | null>();
        
        variantesActivas.forEach((v) => {
          if (v.color && !imagenesPorColor.has(v.color)) {
            // Buscar primera variante de este color con imagen
            const varianteConImagen = variantesActivas.find(
              (v2) => v2.color === v.color && 
              ((v2 as any).imagenes?.[0]?.imagenUrl || v2.imagenVariante)
            );
            
            const imagen = (varianteConImagen as any)?.imagenes?.[0]?.imagenUrl || 
                           varianteConImagen?.imagenVariante || 
                           null;
            imagenesPorColor.set(v.color, imagen);
          }
        });
        
        // Variantes simplificadas
        const variantes: VariantePublicada[] = variantesActivas.map((v) => {
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
              .map((v) => v.color)
              .filter((c): c is string => !!c)
          )
        ).sort();
        
        const talles = Array.from(
          new Set(
            variantesActivas
              .map((v) => v.talle)
              .filter((t): t is string => !!t)
          )
        ).sort();
        
        const stockTotal = variantesActivas.reduce(
          (sum, v) => sum + Number(v.stockCache || 0),
          0
        );
        
        // Obtener sexo común de todas las variantes (las variantes heredan el sexo del producto padre)
        // Si todas las variantes tienen el mismo sexo, usar ese. Si no, usar null.
        const sexos = variantesActivas
          .map((v) => v.sexo)
          .filter((s): s is string => !!s);
        const sexoUnico: string | null = sexos.length > 0 && new Set(sexos).size === 1 
          ? (sexos[0] ?? null)
          : null;
        
        return {
          id: producto.id,
          codigoAgrupacion: producto.codigoAgrupacion,
          slug: producto.slug,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          descripcionCorta: producto.descripcionCorta,
          destacado: producto.destacado,
          orden: producto.orden,
          sexo: sexoUnico, // Sexo del producto padre (heredado por todas las variantes)
          rubro: producto.rubro && producto.rubro.slug
            ? {
                id: producto.rubro.id,
                nombre: producto.rubro.nombre,
                slug: producto.rubro.slug,
              }
            : null,
          subrubro: producto.subrubro && producto.subrubro.slug
            ? {
                id: producto.subrubro.id,
                nombre: producto.subrubro.nombre,
                slug: producto.subrubro.slug,
              }
            : null,
          imagenPrincipal,
          precioLista,
          precioTransfer,
          precio3Cuotas,
          precioSinImp,
          variantes,
          colores,
          talles,
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
}

export const productoService = new ProductoService();

