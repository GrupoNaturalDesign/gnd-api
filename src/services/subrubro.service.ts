import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  SubrubroQueryParams,
  SubrubroConRubro,
  SubrubroBySlugParams,
  PaginatedResponse,
} from '../types';

export class SubrubroService {
  async getAll(params: SubrubroQueryParams & { empresaId: number }): Promise<PaginatedResponse<SubrubroConRubro>> {
    const where: Prisma.SubrubroWhereInput = {
      empresaId: params.empresaId,
      ...(params.rubroId && {
        rubroId: params.rubroId,
      }),
      ...(params.visibleWeb !== undefined && {
        visibleWeb: params.visibleWeb,
      }),
      ...(params.search && {
        nombre: {
          contains: params.search,
        },
      }),
    };

    const include: Prisma.SubrubroInclude = {
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      _count: {
        select: {
          productosPadre: true,
        },
      },
    };

    // Paginación: valores por defecto
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = params.offset !== undefined ? params.offset : (page - 1) * limit;

    // Obtener total de registros
    const total = await prisma.subrubro.count({ where });

    // Obtener datos paginados
    const data = await prisma.subrubro.findMany({
      where,
      include,
      orderBy: { orden: 'asc' },
      skip,
      take: limit,
    }) as SubrubroConRubro[];

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
    includeProductos = false
  ): Promise<SubrubroConRubro | null> {
    const include: Prisma.SubrubroInclude = {
      rubro: {
        select: {
          id: true,
          nombre: true,
          slug: true,
        },
      },
      _count: {
        select: {
          productosPadre: true,
        },
      },
    };

    return prisma.subrubro.findUnique({
      where: { id },
      include,
    }) as Promise<SubrubroConRubro | null>;
  }

  async getBySlug(
    slug: string,
    empresaId: number
  ): Promise<SubrubroConRubro | null> {
    return prisma.subrubro.findFirst({
      where: {
        slug,
        empresaId,
        visibleWeb: true,
      },
      include: {
        rubro: {
          select: {
            id: true,
            nombre: true,
            slug: true,
          },
        },
        _count: {
          select: {
            productosPadre: true,
          },
        },
      },
    }) as Promise<SubrubroConRubro | null>;
  }
}

export const subrubroService = new SubrubroService();

