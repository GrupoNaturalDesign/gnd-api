import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import type {
  SubrubroQueryParams,
  SubrubroConRubro,
  SubrubroBySlugParams,
} from '../types';

export class SubrubroService {
  async getAll(params: SubrubroQueryParams): Promise<SubrubroConRubro[]> {
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

    return prisma.subrubro.findMany({
      where,
      include,
      orderBy: { orden: 'asc' },
    }) as Promise<SubrubroConRubro[]>;
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

