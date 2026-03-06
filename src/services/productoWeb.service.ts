import prisma from '../lib/prisma';
import { productoPrecioService } from './productoPrecio.service';

export interface UpdateProductoWebData {
  stockCache?: number | null;
  precioCache?: number | null;
}

export class ProductoWebService {
  /**
   * Actualiza un ProductoWeb
   * Si se envía precioCache, también crea/actualiza ProductoPrecio (minorista) para centralizar precios.
   * Retorna el producto actualizado con su relación productoPadre
   */
  async update(id: number, data: UpdateProductoWebData) {
    const updateData: any = {};

    if (data.stockCache !== undefined) {
      updateData.stockCache = data.stockCache;
    }

    if (data.precioCache !== undefined) {
      updateData.precioCache = data.precioCache;
    }

    const productoWeb = await prisma.productoWeb.update({
      where: { id },
      data: updateData,
      include: {
        productoPadre: {
          select: {
            id: true,
            empresaId: true,
          },
        },
      },
    });

    // Centralizar precios: si se actualizó precioCache y es > 0, upsert en ProductoPrecio (minorista)
    if (data.precioCache !== undefined && data.precioCache !== null && Number(data.precioCache) > 0) {
      await productoPrecioService.upsert({
        productoWebId: id,
        tipoCliente: 'minorista',
        precioLista: Number(data.precioCache),
      });
    }

    return productoWeb;
  }

  /**
   * Actualiza múltiples ProductoWeb en lote.
   * Ejecuta en lotes para no agotar el pool de conexiones (evita pool timeout).
   * Retorna los productos actualizados con sus relaciones (productoPadre).
   */
  private static BULK_BATCH_SIZE = 5;

  async updateBulk(updates: Array<{ id: number } & UpdateProductoWebData>) {
    const results: Awaited<ReturnType<ProductoWebService['update']>>[] = [];

    for (let i = 0; i < updates.length; i += ProductoWebService.BULK_BATCH_SIZE) {
      const batch = updates.slice(i, i + ProductoWebService.BULK_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((update) => {
          const { id, ...data } = update;
          return this.update(id, data);
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Obtiene un ProductoWeb por ID
   */
  async getById(id: number, includePrecios = false) {
    return prisma.productoWeb.findUnique({
      where: { id },
      include: {
        productoPadre: true,
        ...(includePrecios && { precios: true }),
      },
    });
  }

  /**
   * Obtiene todas las variantes de un ProductoPadre
   */
  async getByProductoPadreId(productoPadreId: number, includePrecios = false) {
    return prisma.productoWeb.findMany({
      where: {
        productoPadreId,
        activoSfactory: true,
      },
      include: {
        ...(includePrecios && { precios: true }),
      },
      orderBy: [
        { color: 'asc' },
        { talle: 'asc' },
      ],
    });
  }

  /**
   * Obtiene la primera variante de un ProductoPadre con un color específico
   */
  async getFirstByColor(productoPadreId: number, color: string) {
    return prisma.productoWeb.findFirst({
      where: {
        productoPadreId,
        color,
        activoSfactory: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }
}

export const productoWebService = new ProductoWebService();

