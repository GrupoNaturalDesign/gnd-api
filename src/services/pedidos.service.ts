import { sfactoryService } from './sfactory/sfactory.service';
import type { ApiResponse } from '../types';
import type { SFactoryListarOrdenPedidoParams } from '../types/sfactory.types';

export class PedidosService {
  /**
   * Listar pedidos desde SFactory (sin guardar en BD)
   * Útil para ver la estructura de datos
   */
  async listarDesdeSFactory(parameters: Record<string, unknown> = {}): Promise<ApiResponse> {
    try {
      const fechaDesde =
        typeof parameters.desde === 'string' ? parameters.desde : new Date().toISOString().slice(0, 10);
      const fechaHasta =
        typeof parameters.hasta === 'string' ? parameters.hasta : fechaDesde;

      const empresaIdRaw =
        parameters.empresa_id ?? process.env.SFACTORY_EMPRESA_ID_LISTADO;
      const comercialIdRaw =
        parameters.comercial_id ?? process.env.SFACTORY_COMERCIAL_ID_LISTADO;

      if (empresaIdRaw == null || comercialIdRaw == null) {
        throw new Error(
          'Se requieren empresa_id y comercial_id (query o SFACTORY_EMPRESA_ID_LISTADO / SFACTORY_COMERCIAL_ID_LISTADO)'
        );
      }

      const empresa_id =
        typeof empresaIdRaw === 'string' ? parseInt(empresaIdRaw, 10) : Number(empresaIdRaw);
      const comercial_id =
        typeof comercialIdRaw === 'string'
          ? parseInt(comercialIdRaw, 10)
          : Number(comercialIdRaw);

      if (!Number.isFinite(empresa_id) || !Number.isFinite(comercial_id)) {
        throw new Error('empresa_id y comercial_id deben ser numéricos');
      }

      const params: SFactoryListarOrdenPedidoParams = {
        desde: fechaDesde,
        hasta: fechaHasta,
        empresa_id,
        comercial_id,
      };

      console.log('[PedidosService] Llamando a SFactory con parámetros:', params);

      const response = await sfactoryService.listarOrdenesPedido(params);

      return {
        success: true,
        data: response,
        message: 'Pedidos obtenidos exitosamente desde SFactory',
      } as ApiResponse;
    } catch (error: any) {
      // Mejorar el manejo de errores
      let errorMessage = 'Error desconocido';
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString && error.toString() !== '[object Object]') {
        errorMessage = error.toString();
      } else {
        // Intentar serializar el error
        try {
          errorMessage = JSON.stringify(error);
        } catch {
          errorMessage = 'Error desconocido al procesar la respuesta de SFactory';
        }
      }
      
      console.error('[PedidosService.listarDesdeSFactory] Error completo:', {
        message: errorMessage,
        error: error,
        stack: error?.stack,
      });

      throw new Error(`Error al listar pedidos desde SFactory: ${errorMessage}`);
    }
  }
}

export const pedidosService = new PedidosService();

