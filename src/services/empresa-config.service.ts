import prisma from '../lib/prisma';
import { calcularPreciosDerivados } from './precios-derivados.service';

export interface PrecioConfig {
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
}

export interface EmpresaPrecioConfig extends PrecioConfig {
  empresaId: number;
  precioConfigUpdatedAt: Date | null;
}

export interface UpdatePrecioConfigInput {
  descuentoTransferencia?: number;
  iva?: number;
  cuotasFinanciado?: number;
}

function mapEmpresaPrecioConfig(empresa: {
  id: number;
  descuentoTransferencia: unknown;
  iva: unknown;
  cuotasFinanciado: number;
  precioConfigUpdatedAt: Date | null;
}): EmpresaPrecioConfig {
  return {
    empresaId: empresa.id,
    descuentoTransferencia: Number(empresa.descuentoTransferencia),
    iva: Number(empresa.iva),
    cuotasFinanciado: empresa.cuotasFinanciado,
    precioConfigUpdatedAt: empresa.precioConfigUpdatedAt,
  };
}

const empresaPrecioSelect = {
  id: true,
  descuentoTransferencia: true,
  iva: true,
  cuotasFinanciado: true,
  precioConfigUpdatedAt: true,
} as const;

export class EmpresaConfigService {
  async getPrecioConfig(empresaId: number): Promise<EmpresaPrecioConfig> {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: empresaPrecioSelect,
    });

    if (!empresa) {
      throw new Error(`Empresa ${empresaId} no encontrada`);
    }

    return mapEmpresaPrecioConfig(empresa);
  }

  async updatePrecioConfig(
    empresaId: number,
    input: UpdatePrecioConfigInput
  ): Promise<EmpresaPrecioConfig> {
    const updateData: Record<string, unknown> = {
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
      select: empresaPrecioSelect,
    });

    return mapEmpresaPrecioConfig(empresa);
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
        if (!Number.isFinite(precioLista) || precioLista <= 0) continue;

        const derivados =
          precio.usaConfigPersonalizada && precio.descuentoTransferencia !== null
            ? calcularPreciosDerivados({
                precioLista,
                empresaConfig: config,
                cuotasOverride: precio.cuotasFinanciadoOverride ?? config.cuotasFinanciado,
                descuentoOverride: Number(precio.descuentoTransferencia),
                ivaOverride: Number(precio.iva ?? config.iva),
              })
            : calcularPreciosDerivados({
                precioLista,
                empresaConfig: config,
              });

        await prisma.productoPrecio.update({
          where: { id: precio.id },
          data: {
            precioTransfer: derivados.precioTransfer,
            precioSinImp: derivados.precioSinImp,
            cuotasFinanciado: derivados.cuotas,
          },
        });
        actualizados++;
      }
    }

    return { actualizados };
  }
}

export const empresaConfigService = new EmpresaConfigService();
