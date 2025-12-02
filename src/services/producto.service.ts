import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  ProductoQueryParams,
  ProductoPadreConVariantes,
  ProductoBySlugParams,
} from '../types';

export class ProductoService {
  async getAll(
    params: ProductoQueryParams
  ): Promise<ProductoPadreConVariantes[]> {
    const where: Prisma.ProductoPadreWhereInput = {
      empresaId: params.empresaId,
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

    return prisma.productoPadre.findMany({
      where,
      include,
      orderBy: [
        { destacado: 'desc' },
        { orden: 'asc' },
        { nombre: 'asc' },
      ],
    }) as Promise<ProductoPadreConVariantes[]>;
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

    return prisma.productoPadre.findFirst({
      where: {
        slug,
        empresaId,
        publicado: true,
      },
      include,
    }) as Promise<ProductoPadreConVariantes | null>;
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
}

export const productoService = new ProductoService();

