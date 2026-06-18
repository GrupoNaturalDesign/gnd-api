import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { calcularPreciosDerivadosCompletos } from './precios-derivados.service';
import type { InstallmentProviderOptions } from '../types/installment.types';

export interface PrecioConfig {
  descuentoTransferencia: number;
  iva: number;
  cuotasFinanciado: number;
  installmentProvider: string;
  installmentProviderOptions: InstallmentProviderOptions;
}

export interface EmpresaPrecioConfig extends PrecioConfig {
  empresaId: number;
  precioConfigUpdatedAt: Date | null;
}

export interface UpdatePrecioConfigInput {
  descuentoTransferencia?: number;
  iva?: number;
  cuotasFinanciado?: number;
  installmentProvider?: string;
  installmentProviderOptions?: InstallmentProviderOptions;
}

function mapEmpresaPrecioConfig(empresa: {
  id: number;
  descuentoTransferencia: unknown;
  iva: unknown;
  cuotasFinanciado: number;
  installmentProvider: string;
  installmentProviderOptions: unknown;
  precioConfigUpdatedAt: Date | null;
}): EmpresaPrecioConfig {
  const rawOpts = empresa.installmentProviderOptions;
  const installmentProviderOptions =
    rawOpts != null && typeof rawOpts === 'object' && !Array.isArray(rawOpts)
      ? (rawOpts as InstallmentProviderOptions)
      : {};

  return {
    empresaId: empresa.id,
    descuentoTransferencia: Number(empresa.descuentoTransferencia),
    iva: Number(empresa.iva),
    cuotasFinanciado: empresa.cuotasFinanciado,
    installmentProvider: empresa.installmentProvider,
    installmentProviderOptions,
    precioConfigUpdatedAt: empresa.precioConfigUpdatedAt,
  };
}

const empresaPrecioSelect = {
  id: true,
  descuentoTransferencia: true,
  iva: true,
  cuotasFinanciado: true,
  installmentProvider: true,
  installmentProviderOptions: true,
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
    if (input.installmentProvider !== undefined) {
      updateData.installmentProvider = input.installmentProvider;
    }
    if (input.installmentProviderOptions !== undefined) {
      updateData.installmentProviderOptions = input.installmentProviderOptions;
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

        let derivados;
        if (precio.usaConfigPersonalizada && precio.descuentoTransferencia !== null) {
          derivados = await calcularPreciosDerivadosCompletos({
            precioLista,
            empresaId,
            empresaConfig: config,
            cuotasOverride: precio.cuotasFinanciadoOverride ?? config.cuotasFinanciado,
            descuentoOverride: Number(precio.descuentoTransferencia),
            ivaOverride: Number(precio.iva ?? config.iva),
          });
        } else {
          derivados = await calcularPreciosDerivadosCompletos({
            precioLista,
            empresaId,
            empresaConfig: config,
          });
        }

        await prisma.productoPrecio.update({
          where: { id: precio.id },
          data: {
            precioTransfer: derivados.precioTransfer,
            precioSinImp: derivados.precioSinImp,
            precioFinanciado: derivados.precioFinanciado,
            cuotasFinanciado: derivados.cuotas,
            cuotasSnapshot: (derivados.cuotasSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        actualizados++;
      }
    }

    return { actualizados };
  }

  /** Cotiza cuotas para un monto (carrito / preview). */
  async quoteCuotasForAmount(
    empresaId: number,
    amount: number,
    cuotasOverride?: number
  ) {
    const config = await this.getPrecioConfig(empresaId);
    const cuotas = cuotasOverride ?? config.cuotasFinanciado;
    const derivados = await calcularPreciosDerivadosCompletos({
      precioLista: amount,
      empresaId,
      empresaConfig: config,
      cuotasOverride: cuotas,
    });
    return derivados.cuotasSnapshot;
  }
}

export const empresaConfigService = new EmpresaConfigService();
