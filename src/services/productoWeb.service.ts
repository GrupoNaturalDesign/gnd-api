import prisma from '../lib/prisma';

export interface UpdateProductoWebData {
  stockCache?: number | null;
  precioCache?: number | null;
}

export class ProductoWebService {
  /**
   * Actualiza un ProductoWeb
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
    });

    return productoWeb;
  }

  /**
   * Actualiza múltiples ProductoWeb en lote
   */
  async updateBulk(updates: Array<{ id: number } & UpdateProductoWebData>) {
    const promises = updates.map((update) => {
      const { id, ...data } = update;
      return this.update(id, data);
    });

    return Promise.all(promises);
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

