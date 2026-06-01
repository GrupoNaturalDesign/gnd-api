import prisma from '../lib/prisma';
import type { AdminSearchResult } from '../types/admin-search.types';
import { buildAdminListHref } from '../utils/admin-search-href';
import { buildProductoPadreTextSearchFilter } from '../utils/producto-padre-search.util';
import { pedidoSyncService } from './pedido-sync.service';
import { clientesService } from './clientes.service';
import { usuarioAdminService } from './usuario-admin.service';

const PER_ENTITY = 4;

export class AdminSearchService {
  async search(empresaId: number, q: string, limit = 12): Promise<AdminSearchResult[]> {
    const perEntity = Math.min(PER_ENTITY, Math.max(2, Math.ceil(limit / 5)));

    const [productos, pedidos, clientes, usuarios, cupones] = await Promise.all([
      this.searchProductos(empresaId, q, perEntity),
      this.searchPedidos(empresaId, q, perEntity),
      this.searchClientes(empresaId, q, perEntity),
      this.searchUsuarios(empresaId, q, perEntity),
      this.searchCupones(empresaId, q, perEntity),
    ]);

    return [...productos, ...pedidos, ...clientes, ...usuarios, ...cupones].slice(0, limit);
  }

  private async searchProductos(
    empresaId: number,
    q: string,
    take: number
  ): Promise<AdminSearchResult[]> {
    const rows = await prisma.productoPadre.findMany({
      where: {
        empresaId,
        ...(await buildProductoPadreTextSearchFilter(q, { empresaId })),
      },
      select: { id: true, nombre: true, codigoAgrupacion: true, publicado: true },
      take,
      orderBy: { nombre: 'asc' },
    });

    return rows.map((p) => {
      const filterValue = p.codigoAgrupacion?.trim() || p.nombre;
      return {
        id: `producto-${p.id}`,
        label: p.nombre,
        meta: 'Producto',
        href: buildAdminListHref('/admin/productos', { param: 'search', value: filterValue }),
      };
    });
  }

  private async searchPedidos(
    empresaId: number,
    q: string,
    take: number
  ): Promise<AdminSearchResult[]> {
    const { data } = await pedidoSyncService.listar(empresaId, {
      search: q,
      page: 1,
      limit: take,
    });

    return data.map((p) => ({
      id: `pedido-${p.id}`,
      label: `Pedido #${p.id} — ${p.clienteNombre}`,
      meta: 'Pedido',
      href: buildAdminListHref('/admin/pedidos', { param: 'search', value: String(p.id) }),
    }));
  }

  private async searchClientes(
    empresaId: number,
    q: string,
    take: number
  ): Promise<AdminSearchResult[]> {
    const { data } = await clientesService.listar(empresaId, {
      search: q,
      page: 1,
      limit: take,
    });

    return data.map((c) => {
      const label = c.razonSocial?.trim() || c.nombre?.trim() || c.email || `Cliente #${c.id}`;
      const filterValue =
        c.razonSocial?.trim() || c.nombre?.trim() || c.sfactoryCodigo?.trim() || c.email || String(c.id);
      return {
        id: `cliente-${c.id}`,
        label,
        meta: 'Cliente',
        href: buildAdminListHref('/admin/clientes', { param: 'search', value: filterValue }),
      };
    });
  }

  private async searchUsuarios(
    empresaId: number,
    q: string,
    take: number
  ): Promise<AdminSearchResult[]> {
    const { data: usuarios } = await usuarioAdminService.listar(empresaId, {
      q,
      page: 1,
      limit: take,
    });

    return usuarios.map((u) => {
      const name = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
      const label = name ? `${name} — ${u.email}` : u.email;
      return {
        id: `usuario-${u.id}`,
        label,
        meta: 'Usuario',
        href: buildAdminListHref('/admin/usuarios', { param: 'q', value: u.email }),
      };
    });
  }

  private async searchCupones(
    empresaId: number,
    q: string,
    take: number
  ): Promise<AdminSearchResult[]> {
    const rows = await prisma.cupon.findMany({
      where: {
        empresaId,
        OR: [{ codigo: { contains: q } }, { nombre: { contains: q } }],
      },
      select: { id: true, codigo: true, nombre: true },
      take,
      orderBy: { creadoEn: 'desc' },
    });

    return rows.map((c) => ({
      id: `cupon-${c.id}`,
      label: `${c.codigo} — ${c.nombre}`,
      meta: 'Cupón',
      href: buildAdminListHref('/admin/cupones', { param: 'search', value: c.codigo }),
    }));
  }
}

export const adminSearchService = new AdminSearchService();
