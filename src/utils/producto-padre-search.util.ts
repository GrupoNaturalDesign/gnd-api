import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

function toLikePattern(search: string): string {
  const escaped = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

export type ProductoPadreTextSearchOptions = {
  empresaId?: number;
  /** Incluye descripcion_corta (listados ecommerce). */
  includeDescripcionCorta?: boolean;
};

/**
 * IDs de productos_padre cuyo nombre, descripción o código agrupa coinciden con el texto.
 * COLLATE explícito evita "Illegal mix of collations" (utf8mb4_bin vs utf8mb4_unicode_ci).
 */
export async function findProductoPadreIdsByTextSearch(
  search: string,
  options: ProductoPadreTextSearchOptions = {}
): Promise<number[]> {
  const pattern = toLikePattern(search);
  const { empresaId, includeDescripcionCorta = false } = options;
  const empresaFilter =
    empresaId === undefined ? Prisma.sql`1 = 1` : Prisma.sql`empresa_id = ${empresaId}`;

  const rows = includeDescripcionCorta
    ? await prisma.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM productos_padre
        WHERE ${empresaFilter}
        AND (
          nombre COLLATE utf8mb4_unicode_ci LIKE ${pattern}
          OR descripcion COLLATE utf8mb4_unicode_ci LIKE ${pattern}
          OR descripcion_corta COLLATE utf8mb4_unicode_ci LIKE ${pattern}
          OR codigo_agrupacion COLLATE utf8mb4_unicode_ci LIKE ${pattern}
        )
      `
    : await prisma.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM productos_padre
        WHERE ${empresaFilter}
        AND (
          nombre COLLATE utf8mb4_unicode_ci LIKE ${pattern}
          OR descripcion COLLATE utf8mb4_unicode_ci LIKE ${pattern}
          OR codigo_agrupacion COLLATE utf8mb4_unicode_ci LIKE ${pattern}
        )
      `;

  // MariaDB devuelve UNSIGNED INT como BigInt; Prisma espera number en filtros Int.
  return rows.map((r) => Number(r.id));
}

/** Filtro Prisma para reemplazar OR + contains en listados de producto padre. */
export async function buildProductoPadreTextSearchFilter(
  search: string,
  options: ProductoPadreTextSearchOptions = {}
): Promise<Pick<Prisma.ProductoPadreWhereInput, 'id'>> {
  const ids = await findProductoPadreIdsByTextSearch(search, options);
  return { id: { in: ids } };
}
