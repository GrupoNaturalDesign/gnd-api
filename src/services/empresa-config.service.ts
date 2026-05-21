import prisma from '../lib/prisma';

export interface PrecioConfig {
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
}

export interface EmpresaPrecioConfig {
  empresaId: number;
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
  precioConfigUpdatedAt: Date | null;
}

export interface UpdatePrecioConfigInput {
  descuentoTransferencia?: number;
  iva?: number;
  cuotasFinanciado?: number;
}

export class EmpresaConfigService {
  async getPrecioConfig(empresaId: number): Promise<EmpresaPrecioConfig> {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        descuentoTransferencia: true,
        iva: true,
        cuotasFinanciado: true,
        precioConfigUpdatedAt: true,
      },
    });

    if (!empresa) {
      throw new Error(`Empresa ${empresaId} no encontrada`);
    }

    return {
      empresaId: empresa.id,
      descuentoTransferencia: Number(empresa.descuentoTransferencia),
      iva: Number(empresa.iva),
      cuotasFinanciado: empresa.cuotasFinanciado,
      precioConfigUpdatedAt: empresa.precioConfigUpdatedAt,
    };
  }

  async updatePrecioConfig(
    empresaId: number,
    input: UpdatePrecioConfigInput
  ): Promise<EmpresaPrecioConfig> {
    const updateData: any = {
      precioConfigUpdatedAt: new Date(),
    };

    if (input.descuentoTransferencia !== undefined) {
      updateData.descuentoTransferencia = input.descuentoTransferencia;
    }
    if (input.iva !== undefined) {
      updateData.iva = input.iva;
    }
    if (input.cuotasFinanciado !== undefined) {
      updateData.cuotasFinanciado = input.cuotasFinanciado;
    }

    const empresa = await prisma.empresa.update({
      where: { id: empresaId },
      data: updateData,
      select: {
        id: true,
        descuentoTransferencia: true,
        iva: true,
        cuotasFinanciado: true,
        precioConfigUpdatedAt: true,
      },
    });

    return {
      empresaId: empresa.id,
      descuentoTransferencia: Number(empresa.descuentoTransferencia),
      iva: Number(empresa.iva),
      cuotasFinanciado: empresa.cuotasFinanciado,
      precioConfigUpdatedAt: empresa.precioConfigUpdatedAt,
    };
  }

  async recalcularTodosLosPrecios(empresaId: number): Promise<{ actualizados: number }> {
    const config = await this.getPrecioConfig(empresaId);
    
    const productosWeb = await prisma.productoWeb.findMany({
      where: { empresaId },
      include: {
        precios: {
          where: { tipoCliente: 'minorista' },
        },
      },
    });

    let actualizados = 0;

    for (const pw of productosWeb) {
      for (const precio of pw.precios) {
        const precioLista = Number(precio.precioLista);
        
        if (precio.usaConfigPersonalizada && precio.descuentoTransferencia !== null) {
          const descuento = Number(precio.descuentoTransferencia);
          const iva = Number(precio.iva ?? config.iva);
          const cuotas = precio.cuotasFinanciadoOverride ?? config.cuotasFinanciado;
          
          const precioTransfer = precioLista * (1 - descuento);
          const precioSinImp = precioTransfer / (1 + iva);
          const precioFinanciado = precioLista / cuotas;

          await prisma.productoPrecio.update({
            where: { id: precio.id },
            data: {
              precioTransfer: Number(precioTransfer.toFixed(2)),
              precioSinImp: Number(precioSinImp.toFixed(2)),
              precioFinanciado: Number(precioFinanciado.toFixed(2)),
              cuotasFinanciado: cuotas,
            },
          });
          actualizados++;
        } else {
          const precioTransfer = precioLista * (1 - config.descuentoTransferencia);
          const precioSinImp = precioTransfer / (1 + config.iva);
          const precioFinanciado = precioLista / config.cuotasFinanciado;

          await prisma.productoPrecio.update({
            where: { id: precio.id },
            data: {
              precioTransfer: Number(precioTransfer.toFixed(2)),
              precioSinImp: Number(precioSinImp.toFixed(2)),
              precioFinanciado: Number(precioFinanciado.toFixed(2)),
              cuotasFinanciado: config.cuotasFinanciado,
            },
          });
          actualizados++;
        }
      }
    }

    return { actualizados };
  }
}

export const empresaConfigService = new EmpresaConfigService();