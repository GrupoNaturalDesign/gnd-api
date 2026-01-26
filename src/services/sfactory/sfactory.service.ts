// src/services/sfactory/sfactory.service.ts
import { sfactoryClient } from './sfactory.client';
import type {
  SFactoryItemCreateData,
  SFactoryItemEditData,
  SFactoryItemCreateResponse,
  SFactoryItemEditResponse,
  SFactoryProduct,
} from '../../types/sfactory.types';

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

  /**
   * Crear nuevo item (producto) en SFactory
   * @param data - Datos del producto según formato de SFactory
   * @returns Producto creado con código generado
   */
  async crearItem(data: SFactoryItemCreateData): Promise<SFactoryItemCreateResponse> {
    const response = await sfactoryClient.request<SFactoryItemCreateResponse>(
      'items',
      'items_crear_item',
      { data }
    );
    return response;
  }

  /**
   * Editar item existente en SFactory
   * @param data - Datos del producto incluyendo item_id
   * @returns Producto actualizado
   */
  async editarItem(data: SFactoryItemEditData): Promise<SFactoryItemEditResponse> {
    // SFactory espera { data: { item_id, ...resto de campos } }
    const response = await sfactoryClient.request<SFactoryItemEditResponse>(
      'items',
      'items_editar_item',
      { data }
    );
    return response;
  }

  /**
   * Leer un item específico por código o ID
   * @param identificador - Código o ID del item
   * @returns Producto completo desde SFactory
   */
  async leerItem(identificador: { codigo?: string; item_id?: number }): Promise<SFactoryProduct> {
    const response = await sfactoryClient.request<SFactoryProduct | SFactoryProduct[]>(
      'items',
      'items_leer_item',
      identificador
    );

    // Normalizar respuesta
    if (Array.isArray(response)) {
      if (response.length === 0) {
        throw new Error('Producto no encontrado');
      }
      return response[0] as SFactoryProduct;
    }

    if (response && typeof response === 'object' && 'data' in response) {
      const data = (response as any).data;
      if (Array.isArray(data)) {
        if (data.length === 0) {
          throw new Error('Producto no encontrado');
        }
        return data[0] as SFactoryProduct;
      }
      return data as SFactoryProduct;
    }

    return response as SFactoryProduct;
  }

  /**
   * Borrar item en SFactory
   * @param itemId - ID del item a borrar
   */
  async borrarItem(itemId: number): Promise<{ success: boolean; message?: string }> {
    return sfactoryClient.request('items', 'items_borrar_item', {
      item_id: itemId,
    });
  }
}

export const sfactoryService = new SFactoryService();