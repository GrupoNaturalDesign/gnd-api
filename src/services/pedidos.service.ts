import { sfactoryService } from './sfactory/sfactory.service';
import type { ApiResponse } from '../types';

export class PedidosService {
  /**
   * Listar pedidos desde SFactory (sin guardar en BD)
   * Útil para ver la estructura de datos
   */
  async listarDesdeSFactory(parameters: any = {}): Promise<ApiResponse> {
    try {
      // Hardcodear fechas por ahora
      const fechaDesde = '2025-10-14';
      const fechaHasta = '2025-10-14';

      // Construir parámetros con fechas hardcodeadas
      // Convertir empresa_id y comercial_id a números si vienen como string
      const params: any = {
        desde: fechaDesde,
        hasta: fechaHasta,
      };

      // Agregar empresa_id si viene en parameters
      if (parameters.empresa_id) {
        params.empresa_id = typeof parameters.empresa_id === 'string' 
          ? parseInt(parameters.empresa_id, 10) 
          : parameters.empresa_id;
      }

      // Agregar comercial_id si viene en parameters
      if (parameters.comercial_id) {
        params.comercial_id = typeof parameters.comercial_id === 'string' 
          ? parseInt(parameters.comercial_id, 10) 
          : parameters.comercial_id;
      }

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

