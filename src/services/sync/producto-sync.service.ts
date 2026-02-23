import { Prisma } from '@prisma/client';
import { sfactoryService } from '../sfactory/sfactory.service';
import prisma from '../../lib/prisma';
import type { SFactoryProduct } from '../../types/sfactory.types';
import {
  agruparProductosPorCodigoBase,
  normalizarSexo,
  normalizarRubro,
  parsearNombreProducto,
  extraerCodigoAgrupacion,
} from '../producto-agrupacion.service';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../../config/precios.config';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';

// Type helper for Prisma transaction
type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function generarSlug(text: string, codigo: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  
  const codigoSlug = codigo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${base}-${codigoSlug}`.substring(0, 255);
}

/**
 * Convierte un valor a Decimal de Prisma
 */
function toDecimal(value: any): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) return null;
  return new Prisma.Decimal(num);
}

/**
 * Convierte un valor a string o null
 */
function toStringOrNull(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export class ProductoSyncService {
  /**
   * PASO 1: Sincronizar productos desde SFactory a productos_sfactory (fuente de verdad)
   * Esta tabla NO se muta después de la sincronización inicial
   */
  async syncProductosSfactory(empresaId: number = 1) {
    try {
      const response = await sfactoryService.listarItems();
      
      let productos: SFactoryProduct[] = [];
      
      if (response && typeof response === 'object') {
        if ('data' in response && Array.isArray((response as any).data)) {
          productos = (response as any).data;
        } else if (Array.isArray(response)) {
          productos = response;
        }
      }

      // Ecommerce: solo productos de rubros permitidos (WORKWEAR 3285, OFFICE 3314)
      const productosFiltrados = productos.filter((p: any) => {
        const rubroId = p.rubro_id ?? p.RubroId ?? null;
        return rubroId != null && ECOMMERCE_RUBROS_SFACTORY_IDS.includes(Number(rubroId));
      });
      productos = productosFiltrados;

      // Pre-cargar rubros y subrubros para resolver IDs locales
      const rubros = await prisma.rubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true },
      });
      const rubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      rubros.forEach((r: { id: number; sfactoryId: number }): void => { rubrosMap.set(r.sfactoryId, r.id); });

      const subrubros = await prisma.subrubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true },
      });
      const subrubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      subrubros.forEach((s: { id: number; sfactoryId: number }): void => { subrubrosMap.set(s.sfactoryId, s.id); });

      let insertados = 0;
      let actualizados = 0;
      const errores: Array<{ codigo: string; error: string }> = [];

      // Procesar en lotes para mejor performance
      const BATCH_SIZE = 100;
      const TRANSACTION_TIMEOUT = 30000; // 30 segundos
      
      for (let i = 0; i < productos.length; i += BATCH_SIZE) {
        const batch = productos.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(async (tx: PrismaTransaction): Promise<void> => {
          for (const producto of batch) {
            try {
              const codigo = String((producto as any).Codigo || (producto as any).codigo || '');
              if (!codigo) continue;

              // Resolver rubro_id y subrubro_id locales desde los IDs de SFactory
              const sfactoryRubroId = (producto as any).rubro_id || (producto as any).RubroId || null;
              const sfactorySubrubroId = (producto as any).subrubro_id || (producto as any).SubrubroId || null;
              
              let rubroIdLocal = null;
              let subrubroIdLocal = null;
              
              if (sfactoryRubroId) {
                rubroIdLocal = rubrosMap.get(sfactoryRubroId) || null;
              }
              
              if (sfactorySubrubroId) {
                subrubroIdLocal = subrubrosMap.get(sfactorySubrubroId) || null;
              }

              // Mapear datos de SFactory a ProductoSfactory
              const datosProductoSfactory = {
                empresaId,
                codigo,
                barcode: toStringOrNull((producto as any).Barcode || (producto as any).barcode),
                descrip_corta: toStringOrNull((producto as any).DescripcionCorta || (producto as any).descripcionCorta),
                descripcion: toStringOrNull((producto as any).Descripcion || (producto as any).descripcion),
                detalle: toStringOrNull((producto as any).Detalle || (producto as any).detalle),
                tipo: toStringOrNull((producto as any).Tipo || (producto as any).tipo),
                stockeable: toStringOrNull((producto as any).Stockeable || (producto as any).stockeable),
                stock_minimo: toDecimal((producto as any).StockMin || (producto as any).stockMin),
                stock_maximo: toDecimal((producto as any).StockMax || (producto as any).stockMax),
                precio_costo: toDecimal((producto as any).PrecioCosto || (producto as any).precioCosto),
                precio_venta: toDecimal((producto as any).PrecioVenta || (producto as any).precioVenta),
                // Stock: se guarda en productos_sfactory si viene de SFactory
                // Nota: Stock puede venir como campo directo o necesitar obtenerse de otra fuente
                iva: toDecimal((producto as any).Iva || (producto as any).iva),
                utilidad_planificada: toDecimal((producto as any).UtilidadP || (producto as any).utilidadP),
                utilidad_real: toDecimal((producto as any).UtilidadR || (producto as any).utilidadR),
                rubro: toStringOrNull((producto as any).Rubro || (producto as any).rubro),
                subrubro: toStringOrNull((producto as any).Subrubro || (producto as any).subrubro),
                // Guardar IDs locales resueltos (pueden ser null si no se encuentran)
                rubro_id: rubroIdLocal,
                subrubro_id: subrubroIdLocal,
                item_venta: toStringOrNull((producto as any).ItemDeVenta ? 'S' : (producto as any).itemVenta),
                item_compra: toStringOrNull((producto as any).ItemDeCompra ? 'S' : (producto as any).itemCompra),
                item_alquiler: toStringOrNull((producto as any).ItemDeAlquiler ? 'S' : (producto as any).itemAlquiler),
                codigo_externo: toStringOrNull((producto as any).EqCodigoExterno || (producto as any).codigoExterno),
                peso_bruto: toDecimal((producto as any).PesoBruto || (producto as any).pesoBruto),
                activo: (producto as any).Activo !== false ? 'S' : 'N',
                um: toStringOrNull((producto as any).UM || (producto as any).um),
                um_compra: toStringOrNull((producto as any).UMCompra || (producto as any).umCompra),
                precio_um_compra: toDecimal((producto as any).PrecioUMCompra || (producto as any).precioUMCompra),
                moneda: toStringOrNull((producto as any).Moneda || (producto as any).moneda),
                generico: toStringOrNull((producto as any).Generico || (producto as any).generico),
                grupo_gasto: toStringOrNull((producto as any).GrupoGasto || (producto as any).grupoGasto),
                lista_material: toStringOrNull((producto as any).ListaMaterial || (producto as any).listaMaterial),
                deposito_consumo: toStringOrNull((producto as any).DepositoConsumo || (producto as any).depositoConsumo),
                item_lote: toStringOrNull((producto as any).ItemLote ? 'S' : (producto as any).itemLote),
                item_serie: toStringOrNull((producto as any).ItemSerie ? 'S' : (producto as any).itemSerie),
                fabricar: toStringOrNull((producto as any).Fabricar ? 'S' : (producto as any).fabricar),
                a_pedido: toStringOrNull((producto as any).APedido ? 'S' : (producto as any).aPedido),
                clase: toStringOrNull((producto as any).Clase || (producto as any).clase),
                linea: toStringOrNull((producto as any).Linea || (producto as any).linea),
                material: toStringOrNull((producto as any).Material || (producto as any).material),
                proveedor: toStringOrNull((producto as any).ProveedorPorDefecto || (producto as any).proveedor),
                precio_costo_xlm: toDecimal((producto as any).CostoXLM || (producto as any).costoXLM),
                flowint_sincro_enabled: toStringOrNull((producto as any).FlowintSincroEnabled ? 'S' : (producto as any).flowintSincroEnabled),
                deposito_ubicacion: toStringOrNull((producto as any).Ubicacion || (producto as any).ubicacion),
                actualizar_precio_xoc: toStringOrNull((producto as any).ActPrecioXOC ? 'S' : (producto as any).actPrecioXOC),
                usuario: toStringOrNull((producto as any).Usuario || (producto as any).usuario),
                sfactory_id: (producto as any).id || (producto as any).Id || null,
                ultima_sync: new Date(),
              };

              // Upsert en productos_sfactory (NO se muta después)
              await tx.productoSfactory.upsert({
                where: {
                  unique_empresa_codigo: {
                    empresaId,
                    codigo,
                  },
                },
                update: {
                  ...datosProductoSfactory,
                  updatedAt: new Date(),
                },
                create: datosProductoSfactory,
              });

              insertados++;
            } catch (error: any) {
              errores.push({
                codigo: String((producto as any).Codigo || 'desconocido'),
                error: error.message,
              });
            }
          }
        }, {
          timeout: TRANSACTION_TIMEOUT,
          maxWait: TRANSACTION_TIMEOUT,
        });
      }

      return {
        procesados: productos.length,
        insertados,
        actualizados,
        errores: errores.length,
        detallesErrores: errores,
      };
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * PASO 2: Procesar productos desde productos_sfactory (fuente de verdad)
   * Lee de productos_sfactory y crea/actualiza productos_padre y productos_web
   * SIN MUTAR productos_sfactory
   */
  async procesarProductosDesdeSfactory(empresaId: number = 1) {
    try {
      // Rubros ecommerce: solo procesar productos de estos rubros
      const rubrosEcommerce = await prisma.rubro.findMany({
        where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
        select: { id: true },
      });
      const rubroIdsEcommerce = rubrosEcommerce.map((r) => r.id);

      // Leer productos de productos_sfactory (solo rubros ecommerce si hay alguno)
      const productosSfactory = await prisma.productoSfactory.findMany({
        where: {
          empresaId,
          ...(rubroIdsEcommerce.length > 0 && { rubro_id: { in: rubroIdsEcommerce } }),
        },
        orderBy: { codigo: 'asc' },
      });

      // MEJORA: Pre-cargar rubros y subrubros ANTES de las transacciones
      // CAMBIO: Indexar por sfactoryId en lugar de por nombre para búsqueda más precisa
      const rubros = await prisma.rubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, nombre: true },
      });
      const rubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      rubros.forEach((r: { id: number; sfactoryId: number; nombre: string }): void => { rubrosMap.set(r.sfactoryId, r.id); });

      const subrubros = await prisma.subrubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, rubroId: true, nombre: true },
      });
      const subrubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      subrubros.forEach((s: { id: number; sfactoryId: number; rubroId: number | null; nombre: string }): void => { subrubrosMap.set(s.sfactoryId, s.id); });

      // Convertir a formato SFactoryProduct para usar las funciones existentes
      const productos: SFactoryProduct[] = productosSfactory.map((p: any): SFactoryProduct => {
        const activo = p.activo || 'S';
        return {
          Codigo: p.codigo,
          Descripcion: p.descripcion || p.descrip_corta || p.codigo,
          Rubro: p.rubro || null,
          Subrubro: p.subrubro || null,
          Linea: p.linea || null,
          Material: p.material || null,
          UM: p.um || null,
          PrecioVenta: p.precio_venta ? Number(p.precio_venta) : null,
          Stock: null, // Se actualizará desde otra fuente si es necesario
          Barcode: p.barcode || null,
          Activo: activo === 'S',
          id: p.sfactory_id || undefined,
          Color: null, // Se parseará del nombre
          Talle: null, // Se parseará del nombre
        } as SFactoryProduct;
      });

      // Agrupar productos por código base
      const grupos = agruparProductosPorCodigoBase(productos);

      let exitosos = 0;
      let fallidos = 0;
      let sinCodigo = 0;
      let productosPadreCreados = 0;
      let productosWebCreados = 0;

      // OPTIMIZACIÓN: Crear Map indexado por código ANTES del loop para búsquedas O(1)
      const productosSfactoryMap = new Map<string, typeof productosSfactory[0]>();
      productosSfactory.forEach((p: any): void => {
        productosSfactoryMap.set(p.codigo, p);
      });

      // Aumentar batch size para mejor performance
      const BATCH_SIZE = 50; // Aumentado de 20 a 50 para mejor throughput
      const TRANSACTION_TIMEOUT = 30000; // 30 segundos
      const gruposArray = Array.from(grupos.entries());
      
      for (let i = 0; i < gruposArray.length; i += BATCH_SIZE) {
        const batch = gruposArray.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(async (tx: PrismaTransaction): Promise<void> => {
          for (const [codigoAgrupacion, grupo] of batch) {
            try {
              if (!codigoAgrupacion || grupo.productos.length === 0) {
                continue;
              }

              // Obtener el primer producto para datos generales
              const primerProducto = grupo.productos[0]?.producto;
              if (!primerProducto) {
                continue;
              }

              // OPTIMIZACIÓN: Usar Map para búsqueda O(1) en lugar de .find() O(n)
              const codigoPrimerProducto = String((primerProducto as any).Codigo || '');
              const productoSfactory = productosSfactoryMap.get(codigoPrimerProducto);

              // Usar el nombre base del grupo (sin color, talle ni sexo)
              const nombre = grupo.nombreBase || codigoAgrupacion;
              
              // Descripción vacía en ProductoPadre (solo nombre base)
              const descripcionPadre = '';

              // Normalizar sexo antes de guardar
              const sexoNormalizado = normalizarSexo(grupo.sexo);

              // MEJORA: Usar los IDs ya resueltos en productos_sfactory
              let rubroId = productoSfactory?.rubro_id || null;
              let subrubroId = productoSfactory?.subrubro_id || null;
              
              // Si no se encontraron por ID de SFactory, intentar por nombre como fallback
              if (!rubroId) {
                const rubroNombre = normalizarRubro(productoSfactory?.rubro || (primerProducto as any).Rubro);
                if (rubroNombre) {
                  const rubroPorNombre = await tx.rubro.findFirst({
                    where: {
                      empresaId,
                      nombre: { 
                        equals: rubroNombre,
                      },
                    },
                  });
                  rubroId = rubroPorNombre?.id || null;
                }
              }
              
              if (!subrubroId && rubroId) {
                const subrubroNombre = normalizarRubro(productoSfactory?.subrubro || (primerProducto as any).Subrubro);
                if (subrubroNombre) {
                  const subrubroPorNombre = await tx.subrubro.findFirst({
                    where: {
                      empresaId,
                      rubroId,
                      nombre: { 
                        equals: subrubroNombre,
                      },
                    },
                  });
                  subrubroId = subrubroPorNombre?.id || null;
                }
              }

              // Crear o actualizar producto padre (agrupado)
              const productoPadre = await tx.productoPadre.upsert({
                where: {
                  unique_empresa_agrupacion: {
                    empresaId: empresaId,
                    codigoAgrupacion: codigoAgrupacion,
                  },
                },
                update: {
                  nombre: nombre,
                  descripcion: descripcionPadre,
                  rubroId: rubroId,
                  subrubroId: subrubroId,
                  linea: productoSfactory?.linea || (primerProducto as any).Linea || null,
                  material: productoSfactory?.material || (primerProducto as any).Material || null,
                  um: productoSfactory?.um || (primerProducto as any).UM || null,
                  coloresDisponibles: grupo.colores.length > 0 ? (grupo.colores as any) : null,
                  tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
                },
                create: {
                  empresaId: empresaId,
                  codigoAgrupacion: codigoAgrupacion,
                  nombre: nombre,
                  descripcion: descripcionPadre,
                  rubroId: rubroId,
                  subrubroId: subrubroId,
                  linea: productoSfactory?.linea || (primerProducto as any).Linea || null,
                  material: productoSfactory?.material || (primerProducto as any).Material || null,
                  um: productoSfactory?.um || (primerProducto as any).UM || null,
                  slug: generarSlug(nombre, codigoAgrupacion),
                  coloresDisponibles: grupo.colores.length > 0 ? (grupo.colores as any) : null,
                  tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
                },
              });

              productosPadreCreados++;

              // Crear o actualizar cada variante (ProductoWeb)
              for (const item of grupo.productos) {
                try {
                  const producto = item.producto;
                  const codigoStr = String((producto as any).Codigo || (producto as any).codigo || '');
                  
                  if (!codigoStr) {
                    sinCodigo++;
                    continue;
                  }

                  // OPTIMIZACIÓN: Usar Map para búsqueda O(1) en lugar de .find() O(n)
                  const productoSfactoryItem = productosSfactoryMap.get(codigoStr);

                  // Usar color del parseo o de campos directos
                  let color = item.color;
                  if (!color && productoSfactoryItem) {
                    // Intentar parsear del nombre si no hay color
                    const parseado = parsearNombreProducto(
                      productoSfactoryItem.descripcion || productoSfactoryItem.descrip_corta || codigoStr,
                      codigoStr
                    );
                    color = parseado.color;
                  }
                  
                  const talle = item.talle;

                  // Nombre de la variante: solo el nombre base
                  const nombreVariante = nombre;
                  
                  // Descripción vacía en ProductoWeb
                  const descripcionCompleta = '';

                  // Obtener ID de sFactory
                  const sfactoryId = productoSfactoryItem?.sfactory_id || (producto as any).id || (producto as any).Id || 0;

                  // Datos comunes para update y create
                  const datosProductoWeb = {
                    productoPadreId: productoPadre.id,
                    sfactoryId: sfactoryId,
                    sfactoryBarcode: productoSfactoryItem?.barcode || (producto as any).Barcode || null,
                    nombre: nombreVariante,
                    descripcionCompleta: descripcionCompleta,
                    sexo: sexoNormalizado,
                    talle: talle,
                    color: color,
                    precioCache: productoSfactoryItem?.precio_venta ? Number(productoSfactoryItem.precio_venta) : null,
                    stockCache: (producto as any).Stock !== null && (producto as any).Stock !== undefined 
                      ? Number((producto as any).Stock) 
                      : null,
                    ultimaSyncSfactory: productoSfactoryItem?.ultima_sync || new Date(),
                    activoSfactory: productoSfactoryItem?.activo === 'S' || (producto as any).Activo !== false,
                  };

                  // Upsert en productos_web
                  const productoWeb = await tx.productoWeb.upsert({
                    where: {
                      unique_empresa_sfactory: {
                        empresaId: empresaId,
                        sfactoryCodigo: codigoStr,
                      },
                    },
                    update: {
                      ...datosProductoWeb,
                      productoPadreId: productoPadre.id, // Asegurar que esté vinculado al padre correcto
                    },
                    create: {
                      empresaId: empresaId,
                      sfactoryCodigo: codigoStr,
                      ...datosProductoWeb,
                    },
                  });

                  // Si hay precio_venta, crear/actualizar ProductoPrecio automáticamente dentro de la transacción
                  if (datosProductoWeb.precioCache && datosProductoWeb.precioCache > 0) {
                    try {
                      const precioLista = Number(datosProductoWeb.precioCache);
                      const preciosDerivados = calcularTodosLosPrecios(precioLista, CUOTAS_FINANCIADO_DEFAULT);
                      
                      // Crear precio para minorista (precio lista) dentro de la transacción
                      await tx.productoPrecio.upsert({
                        where: {
                          unique_producto_tipo: {
                            productoWebId: productoWeb.id,
                            tipoCliente: 'minorista',
                          },
                        },
                        create: {
                          productoWebId: productoWeb.id,
                          tipoCliente: 'minorista',
                          precioLista,
                          precio: precioLista,
                          precioTransfer: preciosDerivados.precioTransfer,
                          precioFinanciado: preciosDerivados.precioFinanciado,
                          cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
                          precioSinImp: preciosDerivados.precioSinImp,
                        },
                        update: {
                          precioLista,
                          precio: precioLista,
                          precioTransfer: preciosDerivados.precioTransfer,
                          precioFinanciado: preciosDerivados.precioFinanciado,
                          cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
                          precioSinImp: preciosDerivados.precioSinImp,
                        },
                      });
                    } catch (error: any) {
                      // Log error pero no fallar la sincronización
                      console.warn(`[procesarProductosDesdeSfactory] Error creando ProductoPrecio para ${codigoStr}:`, error.message);
                    }
                  }

                  productosWebCreados++;
                  exitosos++;
                } catch (error: any) {
                  const codigoError = String((item.producto as any).Codigo || 'desconocido');
                  console.error(`Error procesando variante ${codigoError}:`, error);
                  fallidos++;
                }
              }
            } catch (error: any) {
              console.error(`Error procesando grupo ${codigoAgrupacion}:`, error);
              fallidos += grupo.productos.length;
            }
          }
        }, {
          timeout: TRANSACTION_TIMEOUT,
          maxWait: TRANSACTION_TIMEOUT,
        });
      }

      return {
        procesados: productosSfactory.length,
        exitosos,
        fallidos,
        sinCodigo,
        gruposCreados: grupos.size,
        productosPadreCreados,
        productosWebCreados,
      };
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Sincronizar UN SOLO producto desde SFactory (incremental)
   * Usa items_leer_item para obtener solo ese producto
   * Reutiliza toda la lógica de parsing existente
   * 
   * @param codigo - Código del producto en SFactory
   * @param empresaId - ID de la empresa
   * @param productoDirecto - (Opcional) Si ya tienes el producto de SFactory, pásalo aquí para evitar una llamada extra
   */
  async syncProductoIncremental(
    codigo: string,
    empresaId: number = 1,
    productoDirecto?: SFactoryProduct
  ) {
    try {
      let productoData: SFactoryProduct;

      // Si ya tenemos el producto, usarlo directamente
      if (productoDirecto) {
        productoData = productoDirecto;
      } else {
        // Si no, obtenerlo de SFactory
        try {
          productoData = await sfactoryService.leerItem({ codigo });
        } catch (error) {
          // Fallback: usar search_item
          const searchResult = await sfactoryService.buscarItems({
            field: 'Codigo',
            value: codigo,
            mode: 'exact',
          });

          if (Array.isArray(searchResult) && searchResult.length > 0) {
            productoData = searchResult[0] as SFactoryProduct;
          } else if (searchResult && typeof searchResult === 'object' && 'data' in searchResult) {
            const data = (searchResult as any).data;
            productoData = Array.isArray(data) ? data[0] : data;
          } else {
            throw new Error(`Producto con código ${codigo} no encontrado en SFactory`);
          }
        }
      }

      // PASO 1: Sincronizar a productos_sfactory
      await this.syncProductoSfactoryIndividual(productoData, empresaId);

      // PASO 2: Procesar y actualizar productos_padre y productos_web
      // Esto reutiliza TODO el parsing: agrupación, normalización, etc.
      await this.procesarProductoIndividual(productoData, empresaId);

      return {
        success: true,
        codigo,
        message: 'Producto sincronizado correctamente',
      };
    } catch (error: any) {
      throw new Error(`Error al sincronizar producto ${codigo}: ${error.message}`);
    }
  }

  /**
   * Sincronizar un producto individual a productos_sfactory
   * Reutiliza la lógica de syncProductosSfactory pero para un solo producto
   */
  private async syncProductoSfactoryIndividual(
    producto: SFactoryProduct,
    empresaId: number
  ) {
    // Pre-cargar rubros y subrubros
    const rubros = await prisma.rubro.findMany({
      where: { empresaId },
      select: { id: true, sfactoryId: true },
    });
    const rubrosMap = new Map<number, number>();
    rubros.forEach((r: { id: number; sfactoryId: number }) =>
      rubrosMap.set(r.sfactoryId, r.id)
    );

    const subrubros = await prisma.subrubro.findMany({
      where: { empresaId },
      select: { id: true, sfactoryId: true },
    });
    const subrubrosMap = new Map<number, number>();
    subrubros.forEach((s: { id: number; sfactoryId: number }) =>
      subrubrosMap.set(s.sfactoryId, s.id)
    );

    const codigo = String((producto as any).Codigo || (producto as any).codigo || '');
    if (!codigo) {
      throw new Error('Producto sin código');
    }

    // Resolver rubro_id y subrubro_id locales
    // Intentar múltiples variantes de nombres de campos que SFactory puede usar
    const sfactoryRubroId = (producto as any).rubro_id || (producto as any).RubroId || (producto as any).rubroId || null;
    const sfactorySubrubroId = (producto as any).subrubro_id || (producto as any).SubrubroId || (producto as any).subrubroId || null;

    let rubroIdLocal = null;
    let subrubroIdLocal = null;

    if (sfactoryRubroId) {
      rubroIdLocal = rubrosMap.get(Number(sfactoryRubroId)) || null;
      if (!rubroIdLocal) {
        console.warn(`[syncProductoSfactoryIndividual] No se encontró rubro local para sfactoryId: ${sfactoryRubroId}`);
      }
    }

    if (sfactorySubrubroId) {
      subrubroIdLocal = subrubrosMap.get(Number(sfactorySubrubroId)) || null;
      if (!subrubroIdLocal) {
        console.warn(`[syncProductoSfactoryIndividual] No se encontró subrubro local para sfactoryId: ${sfactorySubrubroId}`);
      }
    }

    // Log para debugging
    if (sfactoryRubroId || sfactorySubrubroId) {
      console.log(`[syncProductoSfactoryIndividual] Mapeo de IDs - SFactory rubro_id: ${sfactoryRubroId} -> Local: ${rubroIdLocal}, SFactory subrubro_id: ${sfactorySubrubroId} -> Local: ${subrubroIdLocal}`);
    }

    // Mapear datos (misma lógica que syncProductosSfactory)
    const datosProductoSfactory = {
      empresaId,
      codigo,
      barcode: toStringOrNull((producto as any).Barcode || (producto as any).barcode),
      descrip_corta: toStringOrNull((producto as any).DescripcionCorta || (producto as any).descripcionCorta),
      descripcion: toStringOrNull((producto as any).Descripcion || (producto as any).descripcion),
      detalle: toStringOrNull((producto as any).Detalle || (producto as any).detalle),
      tipo: toStringOrNull((producto as any).Tipo || (producto as any).tipo),
      stockeable: toStringOrNull((producto as any).Stockeable || (producto as any).stockeable),
      stock_minimo: toDecimal((producto as any).StockMin || (producto as any).stockMin),
      stock_maximo: toDecimal((producto as any).StockMax || (producto as any).stockMax),
      precio_costo: toDecimal((producto as any).PrecioCosto || (producto as any).precioCosto),
      precio_venta: toDecimal((producto as any).PrecioVenta || (producto as any).precioVenta),
      iva: toDecimal((producto as any).Iva || (producto as any).iva),
      utilidad_planificada: toDecimal((producto as any).UtilidadP || (producto as any).utilidadP),
      utilidad_real: toDecimal((producto as any).UtilidadR || (producto as any).utilidadR),
      rubro: toStringOrNull((producto as any).Rubro || (producto as any).rubro),
      subrubro: toStringOrNull((producto as any).Subrubro || (producto as any).subrubro),
      rubro_id: rubroIdLocal,
      subrubro_id: subrubroIdLocal,
      item_venta: toStringOrNull((producto as any).ItemDeVenta ? 'S' : (producto as any).itemVenta),
      item_compra: toStringOrNull((producto as any).ItemDeCompra ? 'S' : (producto as any).itemCompra),
      item_alquiler: toStringOrNull((producto as any).ItemDeAlquiler ? 'S' : (producto as any).itemAlquiler),
      codigo_externo: toStringOrNull((producto as any).EqCodigoExterno || (producto as any).codigoExterno),
      peso_bruto: toDecimal((producto as any).PesoBruto || (producto as any).pesoBruto),
      activo: (producto as any).Activo !== false ? 'S' : 'N',
      um: toStringOrNull((producto as any).UM || (producto as any).um),
      um_compra: toStringOrNull((producto as any).UMCompra || (producto as any).umCompra),
      precio_um_compra: toDecimal((producto as any).PrecioUMCompra || (producto as any).precioUMCompra),
      moneda: toStringOrNull((producto as any).Moneda || (producto as any).moneda),
      generico: toStringOrNull((producto as any).Generico || (producto as any).generico),
      grupo_gasto: toStringOrNull((producto as any).GrupoGasto || (producto as any).grupoGasto),
      lista_material: toStringOrNull((producto as any).ListaMaterial || (producto as any).listaMaterial),
      deposito_consumo: toStringOrNull((producto as any).DepositoConsumo || (producto as any).depositoConsumo),
      item_lote: toStringOrNull((producto as any).ItemLote ? 'S' : (producto as any).itemLote),
      item_serie: toStringOrNull((producto as any).ItemSerie ? 'S' : (producto as any).itemSerie),
      fabricar: toStringOrNull((producto as any).Fabricar ? 'S' : (producto as any).fabricar),
      a_pedido: toStringOrNull((producto as any).APedido ? 'S' : (producto as any).aPedido),
      clase: toStringOrNull((producto as any).Clase || (producto as any).clase),
      linea: toStringOrNull((producto as any).Linea || (producto as any).linea),
      material: toStringOrNull((producto as any).Material || (producto as any).material),
      proveedor: toStringOrNull((producto as any).ProveedorPorDefecto || (producto as any).proveedor),
      precio_costo_xlm: toDecimal((producto as any).CostoXLM || (producto as any).costoXLM),
      flowint_sincro_enabled: toStringOrNull((producto as any).FlowintSincroEnabled ? 'S' : (producto as any).flowintSincroEnabled),
      deposito_ubicacion: toStringOrNull((producto as any).Ubicacion || (producto as any).ubicacion),
      actualizar_precio_xoc: toStringOrNull((producto as any).ActPrecioXOC ? 'S' : (producto as any).actPrecioXOC),
      usuario: toStringOrNull((producto as any).Usuario || (producto as any).usuario),
      sfactory_id: (producto as any).id || (producto as any).Id || null,
      ultima_sync: new Date(),
    };

    // Upsert en productos_sfactory
    await prisma.productoSfactory.upsert({
      where: {
        unique_empresa_codigo: {
          empresaId,
          codigo,
        },
      },
      update: {
        ...datosProductoSfactory,
        updatedAt: new Date(),
      },
      create: datosProductoSfactory,
    });
  }

  /**
   * Procesar un producto individual desde productos_sfactory
   * Reutiliza la lógica de procesarProductosDesdeSfactory pero para un solo producto
   */
  private async procesarProductoIndividual(
    producto: SFactoryProduct,
    empresaId: number
  ) {
    const codigo = String((producto as any).Codigo || (producto as any).codigo || '');

    // Obtener el producto desde productos_sfactory (ya sincronizado)
    // Usar findFirst en lugar de findUnique para evitar problemas con nombres de constraints
    const productoSfactory = await prisma.productoSfactory.findFirst({
      where: {
        empresaId,
        codigo,
      },
    });

    if (!productoSfactory) {
      throw new Error(`Producto ${codigo} no encontrado en productos_sfactory`);
    }

    // Pre-cargar rubros y subrubros
    const rubros = await prisma.rubro.findMany({
      where: { empresaId },
      select: { id: true, sfactoryId: true, nombre: true },
    });
    const rubrosMap = new Map<number, number>();
    rubros.forEach((r: { id: number; sfactoryId: number; nombre: string }) =>
      rubrosMap.set(r.sfactoryId, r.id)
    );

    const subrubros = await prisma.subrubro.findMany({
      where: { empresaId },
      select: { id: true, sfactoryId: true, rubroId: true, nombre: true },
    });
    const subrubrosMap = new Map<number, number>();
    subrubros.forEach((s: { id: number; sfactoryId: number; rubroId: number | null; nombre: string }) =>
      subrubrosMap.set(s.sfactoryId, s.id)
    );

    // Convertir a formato SFactoryProduct
    const productoFormateado: SFactoryProduct = {
      Codigo: productoSfactory.codigo,
      Descripcion: productoSfactory.descripcion || productoSfactory.descrip_corta || productoSfactory.codigo,
      Rubro: productoSfactory.rubro || null,
      Subrubro: productoSfactory.subrubro || null,
      Linea: productoSfactory.linea || null,
      Material: productoSfactory.material || null,
      UM: productoSfactory.um || null,
      PrecioVenta: productoSfactory.precio_venta ? Number(productoSfactory.precio_venta) : null,
      Stock: (producto as any).Stock !== null && (producto as any).Stock !== undefined 
        ? Number((producto as any).Stock) 
        : null,
      Barcode: productoSfactory.barcode || null,
      Activo: productoSfactory.activo === 'S',
      id: productoSfactory.sfactory_id || undefined,
      Color: null,
      Talle: null,
    };

    // Agrupar (puede que este producto sea parte de un grupo existente)
    const grupos = agruparProductosPorCodigoBase([productoFormateado]);
    const codigoAgrupacion = extraerCodigoAgrupacion(codigo);
    const grupo = grupos.get(codigoAgrupacion);

    if (!grupo || grupo.productos.length === 0) {
      throw new Error(`No se pudo agrupar el producto ${codigo}`);
    }

    // Procesar el grupo (reutilizar lógica existente)
    const TRANSACTION_TIMEOUT = 30000; // 30 segundos
    await prisma.$transaction(async (tx: PrismaTransaction) => {
      const primerProducto = grupo.productos[0]?.producto;
      if (!primerProducto) return;

      // Resolver rubro y subrubro
      // CRÍTICO: Usar primero los IDs locales que ya están mapeados en productos_sfactory
      // Estos IDs ya fueron mapeados correctamente de SFactory a locales en syncProductoSfactoryIndividual
      let rubroId = productoSfactory.rubro_id || null;
      let subrubroId = productoSfactory.subrubro_id || null;

      // Si no hay IDs mapeados, intentar por nombre como fallback
      if (!rubroId) {
        const rubroNombre = normalizarRubro(productoSfactory.rubro || (primerProducto as any).Rubro);
        if (rubroNombre) {
          const rubroPorNombre = await tx.rubro.findFirst({
            where: {
              empresaId,
              nombre: { equals: rubroNombre },
            },
          });
          rubroId = rubroPorNombre?.id || null;
        }
      }

      if (!subrubroId && rubroId) {
        const subrubroNombre = normalizarRubro(productoSfactory.subrubro || (primerProducto as any).Subrubro);
        if (subrubroNombre) {
          const subrubroPorNombre = await tx.subrubro.findFirst({
            where: {
              empresaId,
              rubroId,
              nombre: { equals: subrubroNombre },
            },
          });
          subrubroId = subrubroPorNombre?.id || null;
        }
      }

      // Log para debugging
      if (rubroId || subrubroId) {
        console.log(`[procesarProductoIndividual] Guardando en ProductoPadre - rubroId: ${rubroId}, subrubroId: ${subrubroId}`);
      } else {
        console.warn(`[procesarProductoIndividual] ADVERTENCIA: No se encontraron rubroId ni subrubroId para producto ${codigo}`);
      }

      const nombre = grupo.nombreBase || codigoAgrupacion;
      const descripcionPadre = '';
      const sexoNormalizado = normalizarSexo(grupo.sexo);

      // Crear o actualizar producto padre
      const productoPadre = await tx.productoPadre.upsert({
        where: {
          unique_empresa_agrupacion: {
            empresaId,
            codigoAgrupacion,
          },
        },
        update: {
          nombre,
          descripcion: descripcionPadre,
          rubroId,
          subrubroId,
          linea: productoSfactory.linea || null,
          material: productoSfactory.material || null,
          um: productoSfactory.um || null,
          coloresDisponibles: grupo.colores.length > 0 ? (grupo.colores as any) : null,
          tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
        },
        create: {
          empresaId,
          codigoAgrupacion,
          nombre,
          descripcion: descripcionPadre,
          rubroId,
          subrubroId,
          linea: productoSfactory.linea || null,
          material: productoSfactory.material || null,
          um: productoSfactory.um || null,
          slug: generarSlug(nombre, codigoAgrupacion),
          coloresDisponibles: grupo.colores.length > 0 ? (grupo.colores as any) : null,
          tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
        },
      });

      // Crear o actualizar variante (ProductoWeb)
      for (const item of grupo.productos) {
        const producto = item.producto;
        const codigoStr = String((producto as any).Codigo || (producto as any).codigo || '');

        if (!codigoStr) continue;

        let color = item.color;
        if (!color) {
          const parseado = parsearNombreProducto(
            productoSfactory.descripcion || productoSfactory.descrip_corta || codigoStr,
            codigoStr
          );
          color = parseado.color;
        }

        const talle = item.talle;
        const nombreVariante = nombre;
        const descripcionCompleta = '';
        const sfactoryId = productoSfactory.sfactory_id || (producto as any).id || (producto as any).Id || 0;

        const datosProductoWeb = {
          productoPadreId: productoPadre.id,
          sfactoryId,
          sfactoryBarcode: productoSfactory.barcode || null,
          nombre: nombreVariante,
          descripcionCompleta,
          sexo: sexoNormalizado,
          talle,
          color,
          precioCache: productoSfactory.precio_venta ? Number(productoSfactory.precio_venta) : null,
          stockCache: (producto as any).Stock !== null && (producto as any).Stock !== undefined 
            ? Number((producto as any).Stock) 
            : null,
          ultimaSyncSfactory: productoSfactory.ultima_sync || new Date(),
          activoSfactory: productoSfactory.activo === 'S',
        };

        const productoWeb = await tx.productoWeb.upsert({
          where: {
            unique_empresa_sfactory: {
              empresaId,
              sfactoryCodigo: codigoStr,
            },
          },
          update: {
            ...datosProductoWeb,
            productoPadreId: productoPadre.id,
          },
          create: {
            empresaId,
            sfactoryCodigo: codigoStr,
            ...datosProductoWeb,
          },
        });

        // Si hay precio_venta, crear/actualizar ProductoPrecio automáticamente dentro de la transacción
        if (datosProductoWeb.precioCache && datosProductoWeb.precioCache > 0) {
          try {
            const precioLista = Number(datosProductoWeb.precioCache);
            const preciosDerivados = calcularTodosLosPrecios(precioLista, CUOTAS_FINANCIADO_DEFAULT);
            
            // Crear precio para minorista (precio lista) dentro de la transacción
            await tx.productoPrecio.upsert({
              where: {
                unique_producto_tipo: {
                  productoWebId: productoWeb.id,
                  tipoCliente: 'minorista',
                },
              },
              create: {
                productoWebId: productoWeb.id,
                tipoCliente: 'minorista',
                precioLista,
                precio: precioLista,
                precioTransfer: preciosDerivados.precioTransfer,
                precioFinanciado: preciosDerivados.precioFinanciado,
                cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
                precioSinImp: preciosDerivados.precioSinImp,
              },
              update: {
                precioLista,
                precio: precioLista,
                precioTransfer: preciosDerivados.precioTransfer,
                precioFinanciado: preciosDerivados.precioFinanciado,
                cuotasFinanciado: CUOTAS_FINANCIADO_DEFAULT,
                precioSinImp: preciosDerivados.precioSinImp,
              },
            });
          } catch (error: any) {
            // Log error pero no fallar la sincronización
            console.warn(`[procesarProductoIndividual] Error creando ProductoPrecio para ${codigoStr}:`, error.message);
          }
        }
      }
    }, {
      timeout: TRANSACTION_TIMEOUT,
      maxWait: TRANSACTION_TIMEOUT,
    });
  }

  /**
   * Método principal que ejecuta ambos pasos
   */
  async syncProductos(empresaId: number = 1) {
    // PASO 1: Sincronizar a productos_sfactory (fuente de verdad)
    const syncSfactory = await this.syncProductosSfactory(empresaId);
    
    // PASO 2: Procesar desde productos_sfactory
    const procesamiento = await this.procesarProductosDesdeSfactory(empresaId);
    
    const resultado = {
      syncSfactory,
      procesamiento,
      resumen: {
        productosSfactory: syncSfactory.procesados,
        productosPadre: procesamiento.productosPadreCreados,
        productosWeb: procesamiento.productosWebCreados,
        exitosos: procesamiento.exitosos,
        fallidos: procesamiento.fallidos + syncSfactory.errores,
      },
    };

    // Mostrar resumen por consola
    console.log('\n========================================');
    console.log('📦 RESUMEN DE SINCRONIZACIÓN DE PRODUCTOS');
    console.log('========================================\n');
    console.log('📥 PASO 1: Sincronización desde SFactory');
    console.log(`   • Productos procesados: ${syncSfactory.procesados}`);
    console.log(`   • Productos insertados/actualizados: ${syncSfactory.insertados}`);
    console.log(`   • Errores: ${syncSfactory.errores}`);
    if (syncSfactory.detallesErrores && syncSfactory.detallesErrores.length > 0) {
      console.log(`   • Primeros errores:`);
      syncSfactory.detallesErrores.slice(0, 5).forEach((err: any) => {
        console.log(`     - ${err.codigo}: ${err.error}`);
      });
      if (syncSfactory.detallesErrores.length > 5) {
        console.log(`     ... y ${syncSfactory.detallesErrores.length - 5} errores más`);
      }
    }
    console.log('\n🔄 PASO 2: Procesamiento y agrupación');
    console.log(`   • Productos procesados: ${procesamiento.procesados}`);
    console.log(`   • Grupos creados: ${procesamiento.gruposCreados}`);
    console.log(`   • Productos padre creados: ${procesamiento.productosPadreCreados}`);
    console.log(`   • Productos web (variantes) creados: ${procesamiento.productosWebCreados}`);
    console.log(`   • Exitosos: ${procesamiento.exitosos}`);
    console.log(`   • Fallidos: ${procesamiento.fallidos}`);
    console.log(`   • Sin código: ${procesamiento.sinCodigo}`);
    console.log('\n📊 RESUMEN GENERAL');
    console.log(`   • Total productos SFactory: ${resultado.resumen.productosSfactory}`);
    console.log(`   • Total productos padre: ${resultado.resumen.productosPadre}`);
    console.log(`   • Total variantes (productos web): ${resultado.resumen.productosWeb}`);
    console.log(`   • Total exitosos: ${resultado.resumen.exitosos}`);
    console.log(`   • Total fallidos: ${resultado.resumen.fallidos}`);
    console.log('========================================\n');
    
    return resultado;
  }
}

export const productoSyncService = new ProductoSyncService();
