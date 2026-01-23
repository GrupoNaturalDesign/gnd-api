import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  RubroQueryParams,
  RubroConSubrubros,
  RubroBySlugParams,
  PaginatedResponse,
} from '../types';

export class RubroService {
  async getAll(params: RubroQueryParams & { empresaId: number }): Promise<PaginatedResponse<RubroConSubrubros>> {
    const where: Prisma.RubroWhereInput = {
      empresaId: params.empresaId,
      ...(params.visibleWeb !== undefined && {
        visibleWeb: params.visibleWeb,
      }),
      ...(params.search && {
        nombre: {
          contains: params.search,
        },
      }),
    };

    const include: Prisma.RubroInclude = {
      subrubros: params.includeSubrubros
        ? {
            where: { visibleWeb: true },
            orderBy: { orden: 'asc' },
          }
        : false,
      _count: {
        select: {
          subrubros: true,
          productosPadre: true,
        },
      },
    };

    // Paginación: valores por defecto
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = params.offset !== undefined ? params.offset : (page - 1) * limit;

    // Obtener total de registros
    const total = await prisma.rubro.count({ where });

    // Obtener datos paginados
    const data = await prisma.rubro.findMany({
      where,
      include,
      orderBy: { orden: 'asc' },
      skip,
      take: limit,
    }) as RubroConSubrubros[];

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
    includeSubrubros = false
  ): Promise<RubroConSubrubros | null> {
    const include: Prisma.RubroInclude = {
      subrubros: includeSubrubros
        ? {
            where: { visibleWeb: true },
            orderBy: { orden: 'asc' },
          }
        : false,
      _count: {
        select: {
          subrubros: true,
          productosPadre: true,
        },
      },
    };

    return prisma.rubro.findUnique({
      where: { id },
      include,
    }) as Promise<RubroConSubrubros | null>;
  }

  async getBySlug(
    slug: string,
    empresaId: number
  ): Promise<RubroConSubrubros | null> {
    return prisma.rubro.findFirst({
      where: {
        slug,
        empresaId,
        visibleWeb: true,
      },
      include: {
        subrubros: {
          where: { visibleWeb: true },
          orderBy: { orden: 'asc' },
        },
        _count: {
          select: {
            subrubros: true,
            productosPadre: true,
          },
        },
      },
    }) as Promise<RubroConSubrubros | null>;
  }
}

export const rubroService = new RubroService();

