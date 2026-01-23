import prisma from '../lib/prisma';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../config/precios.config';

export interface CreateProductoPrecioData {
  productoWebId: number;
  tipoCliente: 'minorista' | 'mayorista';
  precioLista: number;
  minimoUnidades?: number | null;
  cuotasFinanciado?: number;
}

export interface UpdateProductoPrecioData {
  precioLista?: number;
  minimoUnidades?: number | null;
  cuotasFinanciado?: number;
}

export class ProductoPrecioService {
  /**
   * Crea o actualiza un precio de producto
   * Calcula automáticamente los precios derivados
   */
  async upsert(data: CreateProductoPrecioData) {
    const { precioLista, cuotasFinanciado = CUOTAS_FINANCIADO_DEFAULT, ...restData } = data;
    
    const preciosDerivados = calcularTodosLosPrecios(precioLista, cuotasFinanciado);

    return prisma.productoPrecio.upsert({
      where: {
        unique_producto_tipo: {
          productoWebId: data.productoWebId,
          tipoCliente: data.tipoCliente,
        },
      },
      create: {
        ...restData,
        precioLista,
        precio: precioLista, // Mantener compatibilidad con campo precio existente
        precioTransfer: preciosDerivados.precioTransfer,
        precioFinanciado: preciosDerivados.precioFinanciado,
        cuotasFinanciado,
        precioSinImp: preciosDerivados.precioSinImp,
      },
      update: {
        precioLista,
        precio: precioLista, // Mantener compatibilidad
        precioTransfer: preciosDerivados.precioTransfer,
        precioFinanciado: preciosDerivados.precioFinanciado,
        cuotasFinanciado,
        precioSinImp: preciosDerivados.precioSinImp,
        minimoUnidades: data.minimoUnidades,
      },
    });
  }

  /**
   * Actualiza un precio existente
   * Recalcula automáticamente los precios derivados
   */
  async update(id: number, data: UpdateProductoPrecioData) {
    // Obtener el precio actual
    const precioActual = await prisma.productoPrecio.findUnique({
      where: { id },
    });

    if (!precioActual) {
      throw new Error('Precio no encontrado');
    }

    const precioLista = data.precioLista ?? Number(precioActual.precioLista);
    const cuotasFinanciado = data.cuotasFinanciado ?? precioActual.cuotasFinanciado ?? CUOTAS_FINANCIADO_DEFAULT;
    
    const preciosDerivados = calcularTodosLosPrecios(precioLista, cuotasFinanciado);

    return prisma.productoPrecio.update({
      where: { id },
      data: {
        ...data,
        precioLista,
        precio: precioLista, // Mantener compatibilidad
        precioTransfer: preciosDerivados.precioTransfer,
        precioFinanciado: preciosDerivados.precioFinanciado,
        cuotasFinanciado,
        precioSinImp: preciosDerivados.precioSinImp,
      },
    });
  }

  /**
   * Obtiene precios por productoWebId
   */
  async getByProductoWebId(productoWebId: number) {
    return prisma.productoPrecio.findMany({
      where: { productoWebId },
      orderBy: {
        tipoCliente: 'asc',
      },
    });
  }

  /**
   * Obtiene precio por productoWebId y tipoCliente
   */
  async getByProductoWebIdAndTipo(
    productoWebId: number,
    tipoCliente: 'minorista' | 'mayorista'
  ) {
    return prisma.productoPrecio.findUnique({
      where: {
        unique_producto_tipo: {
          productoWebId,
          tipoCliente,
        },
      },
    });
  }

  /**
   * Elimina un precio
   */
  async delete(id: number) {
    return prisma.productoPrecio.delete({
      where: { id },
    });
  }
}

export const productoPrecioService = new ProductoPrecioService();

