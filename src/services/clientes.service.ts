import { sfactoryService } from './sfactory/sfactory.service';
import prisma from '../lib/prisma';
import type { ApiResponse, PaginatedResponse } from '../types';
import type {
  SFactoryCliente,
  SFactoryClienteCreate,
  SFactoryClienteCreateResponse,
} from '../types/sfactory.types';
import type { Cliente } from '@prisma/client';

export class ClientesService {
  /**
   * Mapea datos de SFactory a nuestro modelo Cliente
   */
  private mapSFactoryToCliente(
    sfactoryData: SFactoryCliente,
    empresaId: number
  ): Partial<Cliente> {
    // Helper para convertir a string (cuit debe ser string)
    const toString = (value: any): string | null => {
      if (value === null || value === undefined) return null;
      return String(value);
    };

    // Helper para convertir a número (IDs deben ser números)
    const toInt = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
      return isNaN(num) ? null : num;
    };

    return {
      empresaId,
      sfactoryId: sfactoryData.id,
      sfactoryCodigo: sfactoryData.code,
      razonSocial: sfactoryData.legal_name,
      nombre: sfactoryData.name || null,
      cuit: toString(sfactoryData.tax_id), // Convertir número a string
      tipo: sfactoryData.type || null,
      activo: sfactoryData.active === 1,
      email: sfactoryData.email && sfactoryData.email !== '-' ? sfactoryData.email : null,
      telefono: toString(sfactoryData.phones),
      movil: toString(sfactoryData.mobile),
      domicilioFiscal: sfactoryData.fiscal_address || null,
      localidadId: toInt(sfactoryData.fiscal_locality_id), // Convertir string/number a Int
      provinciaId: toInt(sfactoryData.fiscal_province_id), // Convertir string/number a Int
      paisId: toInt(sfactoryData.fiscal_country_id), // Convertir string/number a Int
      cpFiscal: toString(sfactoryData.fiscal_zip_code),
      categoriaFiscal: sfactoryData.fiscal_category_code || null,
      codigoExterno: toString(sfactoryData.external_id),
      datosCompletos: sfactoryData as any,
      ultimaSync: new Date(),
    };
  }

  /**
   * Mapea nuestro modelo Cliente a formato de creación en SFactory
   */
  private mapClienteToSFactoryCreate(cliente: Partial<Cliente>): SFactoryClienteCreate {
    // Helper para convertir string a número (removiendo caracteres no numéricos)
    const toNumber = (value: string | null | undefined): number | undefined => {
      if (!value) return undefined;
      const num = parseInt(value.replace(/\D/g, ''), 10);
      return isNaN(num) ? undefined : num;
    };

    return {
      codigo: cliente.sfactoryCodigo || '',
      nombre: cliente.nombre || cliente.razonSocial || '',
      razon_social: cliente.razonSocial || '',
      cuit: toNumber(cliente.cuit),
      categoria_fiscal: cliente.categoriaFiscal || undefined,
      telefono: toNumber(cliente.telefono),
      movil: toNumber(cliente.movil),
      codigo_externo: toNumber(cliente.codigoExterno),
      email: cliente.email || undefined,
      domicilio_fiscal: cliente.domicilioFiscal || undefined,
      localidad_fiscal_id: cliente.localidadId || undefined,
      cp_fiscal: toNumber(cliente.cpFiscal),
      provincia_id: cliente.provinciaId || undefined,
      pais_id: cliente.paisId || undefined,
    };
  }

  /**
   * Listar todos los clientes desde nuestra BD
   */
  async listar(
    empresaId: number,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      activo?: boolean;
    }
  ): Promise<PaginatedResponse<Cliente>> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      empresaId,
      ...(params?.activo !== undefined && { activo: params.activo }),
      ...(params?.search && {
        OR: [
          { nombre: { contains: params.search } },
          { razonSocial: { contains: params.search } },
          { sfactoryCodigo: { contains: params.search } },
          { email: { contains: params.search } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cliente.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtener cliente por ID
   */
  async getById(id: number, empresaId: number): Promise<Cliente | null> {
    return prisma.cliente.findFirst({
      where: {
        id,
        empresaId,
      },
    });
  }

  /**
   * Crear cliente en SFactory y guardar en nuestra BD
   */
  async crear(
    datosCliente: Partial<Cliente>,
    empresaId: number
  ): Promise<Cliente> {
    try {
      // 1. Generar código automáticamente si no se proporciona
      if (!datosCliente.sfactoryCodigo) {
        const codigo = await sfactoryService.generarCodigoCliente();
        datosCliente.sfactoryCodigo = codigo;
      }

      // 2. Mapear a formato de SFactory
      const sfactoryData = this.mapClienteToSFactoryCreate(datosCliente);

      // 3. Crear en SFactory
      const sfactoryResponse = (await sfactoryService.crearCliente(
        sfactoryData
      )) as SFactoryClienteCreateResponse;

      // 4. Guardar en nuestra BD
      const clienteData = {
        ...datosCliente,
        empresaId,
        sfactoryId: sfactoryResponse.id,
        sfactoryCodigo: sfactoryResponse.code || datosCliente.sfactoryCodigo,
        datosCompletos: sfactoryResponse as any,
        ultimaSync: new Date(),
      };

      return prisma.cliente.create({
        data: clienteData as any,
      });
    } catch (error: any) {
      throw new Error(`Error al crear cliente: ${error.message}`);
    }
  }

  /**
   * Sincronizar clientes desde SFactory a nuestra BD
   */
  async sincronizar(empresaId: number): Promise<{
    exitosos: number;
    fallidos: number;
    errores: string[];
  }> {
    try {
      console.log(`[ClientesService] Iniciando sincronización para empresaId: ${empresaId}`);
      
      const response = await sfactoryService.listarClientes({});

      let clientes: SFactoryCliente[] = [];

      // Manejar diferentes formatos de respuesta
      if (Array.isArray(response)) {
        clientes = response;
      } else if (response && typeof response === 'object' && 'data' in response) {
        const dataValue = (response as any).data;
        if (Array.isArray(dataValue)) {
          clientes = dataValue;
        }
      } else if (response && typeof response === 'object') {
        // Si la respuesta es un objeto con una propiedad que es array
        const keys = Object.keys(response);
        for (const key of keys) {
          if (Array.isArray((response as any)[key])) {
            clientes = (response as any)[key];
            break;
          }
        }
      }

      console.log(`[ClientesService] Clientes obtenidos: ${clientes.length}`);

      let exitosos = 0;
      let fallidos = 0;
      const errores: string[] = [];

      // Sincronizar cada cliente
      for (const clienteSFactory of clientes) {
        try {
          const clienteData = this.mapSFactoryToCliente(clienteSFactory, empresaId);

          // Remover id y empresaId del update data ya que no se pueden actualizar
          const { id, empresaId: _, ...updateData } = clienteData;
          
          await prisma.cliente.upsert({
            where: {
              unique_empresa_sfactory: {
                empresaId,
                sfactoryCodigo: clienteSFactory.code,
              },
            },
            update: updateData as any,
            create: clienteData as any,
          });

          exitosos++;
        } catch (error: any) {
          fallidos++;
          errores.push(
            `Cliente ${clienteSFactory.code}: ${error.message}`
          );
          console.error(
            `[ClientesService.sincronizar] Error al sincronizar cliente ${clienteSFactory.code}:`,
            error
          );
        }
      }

      return {
        exitosos,
        fallidos,
        errores,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Error desconocido';
      
      // Log detallado del error
      console.error('[ClientesService.sincronizar] Error completo:', {
        message: errorMessage,
        stack: error.stack,
        name: error.name,
        code: error.code,
      });
      
      // Mensaje más descriptivo según el tipo de error
      if (errorMessage.includes('terminated') || 
          errorMessage.includes('Conexión terminada') ||
          errorMessage.includes('ECONNRESET')) {
        throw new Error(
          `Error al sincronizar clientes: La conexión con SFactory se cerró inesperadamente. ` +
          `Esto puede deberse a: token inválido/expirado, servidor sobrecargado, o problemas de red. ` +
          `Intenta nuevamente o verifica la conexión con SFactory. Error original: ${errorMessage}`
        );
      }
      
      throw new Error(`Error al sincronizar clientes: ${errorMessage}`);
    }
  }

  /**
   * Listar clientes desde SFactory (sin guardar en BD)
   * Útil para ver la estructura de datos
   */
  async listarDesdeSFactory(data: any = {}): Promise<ApiResponse> {
    try {
      const response = await sfactoryService.listarClientes(data);

      return {
        success: true,
        data: response,
        message: 'Clientes obtenidos exitosamente desde SFactory',
      } as ApiResponse;
    } catch (error: any) {
      throw new Error(`Error al listar clientes desde SFactory: ${error.message}`);
    }
  }
}

export const clientesService = new ClientesService();
