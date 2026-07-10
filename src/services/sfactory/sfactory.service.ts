// src/services/sfactory/sfactory.service.ts
import { sfactoryClient } from './sfactory.client';
import type {
  SFactoryItemCreateData,
  SFactoryItemEditData,
  SFactoryItemCreateResponse,
  SFactoryItemEditResponse,
  SFactoryProduct,
  SFactoryListarOrdenPedidoParams,
  SFactoryCrearOrdenPedidoParams,
  SFactoryEditarOrdenPedidoParams,
  SFactoryCrearPedidoExternoParams,
  SFactoryCrearPedidoExternoResponse,
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
   * Buscar cliente por código, nombre, CUIT o email
   * Endpoint en SFactory: clientes_buscar_cliente
   * field: 1=código, 2=nombre, 3=CUIT, 4=email
   */
  async buscarCliente(
    search: string,
    companyKey?: string
  ): Promise<any[]> {
    const trimmed = search.trim();
    if (!trimmed) return [];

    const searchValue = trimmed;
    let field = 2;

    const isCuit = /^\d{11}$/.test(trimmed.replace(/\D/g, ''));
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    const isNumeric = /^\d+$/.test(trimmed);

    if (isCuit) {
      field = 3;
    } else if (isEmail) {
      field = 4;
    } else if (isNumeric) {
      field = 1;
    } else {
      field = 2;
    }

    console.log(`[sfactoryService.buscarCliente] Buscar field=${field}, value=${searchValue}`);

    try {
      const response = await sfactoryClient.request(
        'clientes',
        'clientes_buscar_cliente',
        { field, value: searchValue, commercial_id: 0 },
        companyKey
      );

      console.log(`[sfactoryService.buscarCliente] Response:`, JSON.stringify(response).slice(0, 500));

      if (response && typeof response === 'object' && 'data' in response) {
        const data = (response as any).data;
        return Array.isArray(data) ? data : [];
      }
      return Array.isArray(response) ? response : [];
    } catch (err) {
      console.error('[sfactoryService.buscarCliente] Error:', err);
      return [];
    }
  }

  /**
   * Buscar productos/items
   * Endpoint en SFactory: search_item
   *
   * Acepta tanto `{ search, limit }` como criterios libres (`{ field, value, mode, ... }`).
   * Siempre devuelve un array normalizado.
   */
  async buscarItems(criterios: any = {}): Promise<any[]> {
    const params =
      criterios && typeof criterios === 'object' && ('search' in criterios || 'limit' in criterios)
        ? { search: criterios.search || '', limit: criterios.limit || 20 }
        : criterios;

    const response = await sfactoryClient.request('items', 'search_item', params);

    if (response && typeof response === 'object' && 'data' in response) {
      const data = (response as any).data;
      return Array.isArray(data) ? data : [];
    }
    return Array.isArray(response) ? response : [];
  }

  /**
   * Listar órdenes de pedido (`ventas_listar_orden_pedido`)
   */
  async listarOrdenesPedido(
    parameters: SFactoryListarOrdenPedidoParams,
    companyKey?: string
  ) {
    return sfactoryClient.request(
      'ventas',
      'ventas_listar_orden_pedido',
      parameters,
      companyKey
    );
  }

  /**
   * Crear orden de pedido (`ventas_crear_orden_pedido`)
   */
  async crearOrdenPedido(params: SFactoryCrearOrdenPedidoParams, companyKey?: string) {
    return sfactoryClient.request(
      'ventas',
      'ventas_crear_orden_pedido',
      { data: params.data, items: params.items },
      companyKey
    );
  }

  /**
   * Crea un pedido desde un sistema externo (ecommerce).
   * Endpoint: ventas_crear_pedido_externo
   *
   * - El cliente se resuelve por cuit > email > creación automática.
   * - Los ítems se resuelven por SKU. Deben estar activos en SFactory.
   * - Los totales los calcula SFactory.
   * - Comercial, moneda, sucursal: configuración del `source` en SFactory.
   *
   * Prerequisito: `source` activo en external_orders_config (admin SFactory).
   *
   * Envía `fulfillment_mode: none` por defecto: el envío postal lo gestiona GND (Andreani/Correo),
   * no S-Factory. Configurable con SFACTORY_PEDIDO_FULFILLMENT_MODE.
   */
  async crearPedidoExterno(
    params: SFactoryCrearPedidoExternoParams,
    companyKey: string
  ): Promise<SFactoryCrearPedidoExternoResponse> {
    return sfactoryClient.request<SFactoryCrearPedidoExternoResponse>(
      'ventas',
      'ventas_crear_pedido_externo',
      params,
      companyKey
    );
  }

  /**
   * Editar orden de pedido (`ventas_editar_orden_pedido`)
   */
  async editarOrdenPedido(params: SFactoryEditarOrdenPedidoParams, companyKey?: string) {
    return sfactoryClient.request(
      'ventas',
      'ventas_editar_orden_pedido',
      {
        data: params.data,
        items: params.items,
        ...(params.items_deleted?.length ? { items_deleted: params.items_deleted } : {}),
      },
      companyKey
    );
  }

  /**
   * Leer una orden de pedido por id (`ventas_leer_orden_pedido`)
   */
  async leerOrdenPedido(orderId: number, companyKey?: string) {
    return sfactoryClient.request(
      'ventas',
      'ventas_leer_orden_pedido',
      { order_id: orderId },
      companyKey
    );
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

  /**
   * Depósitos / almacenes (module vacío según API S-Factory).
   */
  async listaDepositos(): Promise<{
    data: Array<{ id: number; codigo: string; nombre: string; activo: number }>;
  }> {
    return sfactoryClient.request('', 'lista_depositos', {});
  }

/**
    * Stock y precios por depósito.
    * Con `all_items: true` la API puede rechazar; usar `field` + `items` en lotes.
    */
  async stockItemsByWarehouseV2(parameters: {
    warehouse_id: number;
    all_items?: boolean;
    field?: 'code' | 'sku' | 'id';
    items?: string[] | number[];
  }): Promise<{
    data: Array<{
      item_id: number;
      item_code: string;
      stock: number;
      sale_price: number;
      cost_price?: number;
      warehouse_id: number;
    }>;
  }> {
    return sfactoryClient.request(
      'inventario',
      'inventory_stock_items_by_warehouse_v2',
      parameters
    );
  }

  /**
    * Cancelar orden de pedido (`ventas_cancelar_orden_pedido`)
    */
  async cancelarOrdenPedido(orderId: number, companyKey?: string) {
    return sfactoryClient.request(
      'ventas',
      'ventas_cancelar_orden_pedido',
      { order_id: orderId },
      companyKey
    );
  }

}

export const sfactoryService = new SFactoryService();