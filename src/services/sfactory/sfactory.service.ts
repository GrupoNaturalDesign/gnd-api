// src/services/sfactory/sfactory.service.ts
import { sfactoryClient } from './sfactory.client';

export class SFactoryService {
  /**
   * Listar todos los rubros
   */
  async listarRubros() {
    return sfactoryClient.request('items', 'items_listar_rubros', {
      rubro_id: 0,
      ctb_id: 0,
    });
  }

  /**
   * Listar todos los subrubros
   */
  async listarSubrubros() {
    return sfactoryClient.request('items', 'items_listar_subrubros', {
      subrubro_id: 0,
    });
  }

  /**
   * Listar todos los items (productos)
   */
  async listarItems() {
    return sfactoryClient.request('items', 'items_list', {
      ctb_id: 0,
    });
  }

  /**
   * Buscar items con criterios
   */
  async buscarItems(criterios: any) {
    return sfactoryClient.request('items', 'search_item', criterios);
  }

  /**
   * Crear cliente en SFactory
   */
  async crearCliente(data: any) {
    return sfactoryClient.request('clientes', 'clientes_crear_cliente', { data });
  }

  /**
   * Generar código para nuevo cliente
   * Devuelve el código que SFactory asignará al cliente
   */
  async generarCodigoCliente(): Promise<string> {
    const response = await sfactoryClient.request<any>(
      'clientes',
      'clientes_generar_codigo_cliente',
      {}
    );
    
    // La respuesta puede venir como { codigo: "CLI-001" } o { code: "CLI-001" } o string directo
    if (typeof response === 'string') {
      return response;
    }
    return response.codigo || response.code || '';
  }

  /**
   * Listar clientes
   * Endpoint en SFactory: /customers_list
   */
  async listarClientes(data: any = {}) {
    return sfactoryClient.request('clientes', 'customers_list', data);
  }

  /**
   * Listar órdenes de pedido
   */
  async listarOrdenesPedido(parameters: any = {}) {
    return sfactoryClient.request('ventas', 'ventas_listar_orden_pedido', parameters);
  }

  /**
   * Crear orden de pedido
   */
  async crearOrdenPedido(data: any, items: any[]) {
    return sfactoryClient.request('ventas', 'ventas_crear_orden_pedido', {
      data,
      items,
    });
  }
}

export const sfactoryService = new SFactoryService();