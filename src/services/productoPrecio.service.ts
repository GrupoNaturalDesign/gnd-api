import prisma from '../lib/prisma';
import { CUOTAS_FINANCIADO_DEFAULT } from '../config/precios.config';
import { calcularPreciosDerivados } from './precios-derivados.service';
import { empresaConfigService } from './empresa-config.service';

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
  private async resolveEmpresaId(productoWebId: number): Promise<number> {
    const pw = await prisma.productoWeb.findUnique({
      where: { id: productoWebId },
      select: { empresaId: true },
    });
    if (!pw) throw new Error('Producto web no encontrado');
    return pw.empresaId;
  }

  /**
   * Crea o actualiza un precio de producto.
   * Calcula automáticamente transferencia y sin impuestos.
   */
  async upsert(data: CreateProductoPrecioData) {
    const { precioLista, cuotasFinanciado = CUOTAS_FINANCIADO_DEFAULT, ...restData } = data;
    const empresaId = await this.resolveEmpresaId(data.productoWebId);
    const empresaConfig = await empresaConfigService.getPrecioConfig(empresaId);

    const preciosDerivados = calcularPreciosDerivados({
      precioLista,
      empresaConfig,
      cuotasOverride: cuotasFinanciado,
    });

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
        precio: precioLista,
        precioTransfer: preciosDerivados.precioTransfer,
        cuotasFinanciado: preciosDerivados.cuotas,
        precioSinImp: preciosDerivados.precioSinImp,
      },
      update: {
        precioLista,
        precio: precioLista,
        precioTransfer: preciosDerivados.precioTransfer,
        cuotasFinanciado: preciosDerivados.cuotas,
        precioSinImp: preciosDerivados.precioSinImp,
        minimoUnidades: data.minimoUnidades,
      },
    });
  }

  async update(id: number, data: UpdateProductoPrecioData) {
    const precioActual = await prisma.productoPrecio.findUnique({
      where: { id },
      include: { productoWeb: { select: { empresaId: true } } },
    });

    if (!precioActual) {
      throw new Error('Precio no encontrado');
    }

    const precioLista = data.precioLista ?? Number(precioActual.precioLista);
    const cuotasFinanciado =
      data.cuotasFinanciado ?? precioActual.cuotasFinanciado ?? CUOTAS_FINANCIADO_DEFAULT;
    const empresaConfig = await empresaConfigService.getPrecioConfig(
      precioActual.productoWeb.empresaId
    );

    const preciosDerivados = calcularPreciosDerivados({
      precioLista,
      empresaConfig,
      cuotasOverride: cuotasFinanciado,
    });

    return prisma.productoPrecio.update({
      where: { id },
      data: {
        ...data,
        precioLista,
        precio: precioLista,
        precioTransfer: preciosDerivados.precioTransfer,
        cuotasFinanciado: preciosDerivados.cuotas,
        precioSinImp: preciosDerivados.precioSinImp,
      },
    });
  }

  async getByProductoWebId(productoWebId: number) {
    return prisma.productoPrecio.findMany({
      where: { productoWebId },
      orderBy: { tipoCliente: 'asc' },
    });
  }

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

  async delete(id: number) {
    return prisma.productoPrecio.delete({
      where: { id },
    });
  }
}

export const productoPrecioService = new ProductoPrecioService();
