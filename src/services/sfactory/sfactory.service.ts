// src/services/sfactory/sfactory.service.ts
import { sfactoryClient } from './sfactory.client';

export class SFactoryService {
  /**
   * Listar todos los rubros
   */
  async listarRubros() {
    return sfactoryClient.request('items', 'items_listar_rubros');
  }

  /**
   * Listar todos los subrubros
   */
  async listarSubrubros() {
    return sfactoryClient.request('items', 'items_listar_subrubros');
  }

  /**
   * Listar todos los items (productos)
   */
  async listarItems() {
    return sfactoryClient.request('items', 'items_list');
  }

  /**
   * Buscar items con criterios
   */
  async buscarItems(criterios: any) {
    return sfactoryClient.request('items', 'search_item', criterios);
  }

  /**
   * Crear cliente
   */
  async crearCliente(data: any) {
    return sfactoryClient.request('clientes', 'clientes_crear_cliente', { data });
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