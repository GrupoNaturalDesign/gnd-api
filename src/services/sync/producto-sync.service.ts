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

      // Pre-cargar rubros y subrubros para resolver IDs locales
      const rubros = await prisma.rubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true },
      });
      const rubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      rubros.forEach(r => rubrosMap.set(r.sfactoryId, r.id));

      const subrubros = await prisma.subrubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true },
      });
      const subrubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      subrubros.forEach(s => subrubrosMap.set(s.sfactoryId, s.id));

      let insertados = 0;
      let actualizados = 0;
      const errores: Array<{ codigo: string; error: string }> = [];

      // Procesar en lotes para mejor performance
      const BATCH_SIZE = 100;
      const TRANSACTION_TIMEOUT = 30000; // 30 segundos
      
      for (let i = 0; i < productos.length; i += BATCH_SIZE) {
        const batch = productos.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(async (tx) => {
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
      // Leer TODOS los productos de productos_sfactory de una vez
      const productosSfactory = await prisma.productoSfactory.findMany({
        where: { empresaId },
        orderBy: { codigo: 'asc' },
      });

      // MEJORA: Pre-cargar rubros y subrubros ANTES de las transacciones
      // CAMBIO: Indexar por sfactoryId en lugar de por nombre para búsqueda más precisa
      const rubros = await prisma.rubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, nombre: true },
      });
      const rubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      rubros.forEach(r => rubrosMap.set(r.sfactoryId, r.id));

      const subrubros = await prisma.subrubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, rubroId: true, nombre: true },
      });
      const subrubrosMap = new Map<number, number>(); // Map<sfactoryId, localId>
      subrubros.forEach(s => subrubrosMap.set(s.sfactoryId, s.id));

      // Convertir a formato SFactoryProduct para usar las funciones existentes
      const productos: SFactoryProduct[] = productosSfactory.map((p) => ({
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
        Activo: p.activo === 'S',
        id: p.sfactory_id || null,
        Color: null, // Se parseará del nombre
        Talle: null, // Se parseará del nombre
      } as SFactoryProduct));

      // Agrupar productos por código base
      const grupos = agruparProductosPorCodigoBase(productos);

      let exitosos = 0;
      let fallidos = 0;
      let sinCodigo = 0;
      let productosPadreCreados = 0;
      let productosWebCreados = 0;

      // REDUCIR tamaño del batch y AUMENTAR timeout
      const BATCH_SIZE = 20; // Reducido de 50 a 20
      const TRANSACTION_TIMEOUT = 30000; // 30 segundos
      const gruposArray = Array.from(grupos.entries());
      
      for (let i = 0; i < gruposArray.length; i += BATCH_SIZE) {
        const batch = gruposArray.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(async (tx) => {
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

              // Buscar el producto en productos_sfactory para obtener datos completos
              const codigoPrimerProducto = String((primerProducto as any).Codigo || '');
              const productoSfactory = productosSfactory.find(p => p.codigo === codigoPrimerProducto);

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

                  // Buscar el producto en productos_sfactory para obtener datos completos
                  const productoSfactoryItem = productosSfactory.find(p => p.codigo === codigoStr);

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
                    stockCache: null, // Se actualizará desde otra fuente si es necesario
                    ultimaSyncSfactory: productoSfactoryItem?.ultima_sync || new Date(),
                    activoSfactory: productoSfactoryItem?.activo === 'S' || (producto as any).Activo !== false,
                  };

                  // Upsert en productos_web
                  await tx.productoWeb.upsert({
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
