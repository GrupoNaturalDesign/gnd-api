import { Prisma } from '@prisma/client';
import { sfactoryService } from '../sfactory/sfactory.service';
import prisma from '../../lib/prisma';
import type { SFactoryProduct } from '../../types/sfactory.types';
import {
  agruparProductosPorCodigoBase,
  normalizarSexo,
  normalizarRubro,
  parsearNombreProducto,
} from '../producto-agrupacion.service';
import { calcularTodosLosPrecios, CUOTAS_FINANCIADO_DEFAULT } from '../../config/precios.config';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import {
  hashProductoPadreFields,
  hashProductoSfactoryFields,
  hashProductoWebFields,
  resolveGruposAfectados,
} from '../../utils/sync-hash.utils';

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

      const rubrosEcommerce = await prisma.rubro.findMany({
        where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
        select: { id: true },
      });
      const rubroIdsEcommerce = rubrosEcommerce.map((r) => r.id);

      const existentes = await prisma.productoSfactory.findMany({
        where: {
          empresaId,
          ...(rubroIdsEcommerce.length > 0 && { rubro_id: { in: rubroIdsEcommerce } }),
        },
        select: {
          codigo: true,
          barcode: true,
          descrip_corta: true,
          descripcion: true,
          precio_venta: true,
          activo: true,
          rubro_id: true,
          subrubro_id: true,
          linea: true,
          material: true,
          sfactory_id: true,
        },
      });
      const existentesMap = new Map(existentes.map((p) => [p.codigo, p]));
      const codigosRemotos = new Set<string>();
      const codigosAfectados = new Set<string>();

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
      let omitidos = 0;
      const errores: Array<{ codigo: string; error: string }> = [];

      // Procesar en lotes para mejor performance
      const BATCH_SIZE = 100;
      const TRANSACTION_TIMEOUT = 120000; // 2 minutos (evitar P2028 en sync largo)
      
      for (let i = 0; i < productos.length; i += BATCH_SIZE) {
        const batch = productos.slice(i, i + BATCH_SIZE);
        
        await prisma.$transaction(async (tx: PrismaTransaction): Promise<void> => {
          for (const producto of batch) {
            try {
              const codigo = String((producto as any).Codigo || (producto as any).codigo || '');
              if (!codigo) continue;

              codigosRemotos.add(codigo);

              // Resolver rubro_id y subrubro_id locales desde los IDs de SFactory (Number() por si la API devuelve string)
              const sfactoryRubroId = (producto as any).rubro_id ?? (producto as any).RubroId ?? null;
              const sfactorySubrubroId = (producto as any).subrubro_id ?? (producto as any).SubrubroId ?? null;
              
              let rubroIdLocal: number | null = null;
              let subrubroIdLocal: number | null = null;
              
              if (sfactoryRubroId != null) {
                rubroIdLocal = rubrosMap.get(Number(sfactoryRubroId)) ?? null;
              }
              
              if (sfactorySubrubroId != null) {
                subrubroIdLocal = subrubrosMap.get(Number(sfactorySubrubroId)) ?? null;
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

              const existente = existentesMap.get(codigo);
              const nuevoHash = hashProductoSfactoryFields(datosProductoSfactory);

              if (existente && hashProductoSfactoryFields(existente) === nuevoHash) {
                omitidos++;
                continue;
              }

              codigosAfectados.add(codigo);

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

              if (existente) {
                actualizados++;
              } else {
                insertados++;
              }
              existentesMap.set(codigo, {
                codigo,
                barcode: datosProductoSfactory.barcode,
                descrip_corta: datosProductoSfactory.descrip_corta,
                descripcion: datosProductoSfactory.descripcion,
                precio_venta: datosProductoSfactory.precio_venta,
                activo: datosProductoSfactory.activo,
                rubro_id: datosProductoSfactory.rubro_id,
                subrubro_id: datosProductoSfactory.subrubro_id,
                linea: datosProductoSfactory.linea,
                material: datosProductoSfactory.material,
                sfactory_id: datosProductoSfactory.sfactory_id,
              });
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

      // Bajas: códigos locales ecommerce que ya no vienen de S-Factory
      for (const [codigoLocal, row] of existentesMap) {
        if (codigosRemotos.has(codigoLocal)) continue;
        if (row.activo === 'N') continue;

        await prisma.productoSfactory.update({
          where: { unique_empresa_codigo: { empresaId, codigo: codigoLocal } },
          data: { activo: 'N', ultima_sync: new Date(), updatedAt: new Date() },
        });
        codigosAfectados.add(codigoLocal);
        actualizados++;
      }

      return {
        procesados: productos.length,
        insertados,
        actualizados,
        omitidos,
        codigosAfectados,
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
  async procesarProductosDesdeSfactory(
    empresaId: number = 1,
    options?: { codigosAfectados?: Set<string> }
  ) {
    try {
      const codigosAfectados = options?.codigosAfectados;
      if (codigosAfectados && codigosAfectados.size === 0) {
        return {
          procesados: 0,
          exitosos: 0,
          fallidos: 0,
          sinCodigo: 0,
          gruposCreados: 0,
          gruposProcesados: 0,
          gruposOmitidos: 0,
          productosPadreCreados: 0,
          productosWebCreados: 0,
          productosWebOmitidos: 0,
        };
      }

      const rubrosEcommerce = await prisma.rubro.findMany({
        where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
        select: { id: true },
      });
      const rubroIdsEcommerce = rubrosEcommerce.map((r) => r.id);

      const productosSfactory = await prisma.productoSfactory.findMany({
        where: {
          empresaId,
          ...(rubroIdsEcommerce.length > 0 && { rubro_id: { in: rubroIdsEcommerce } }),
        },
        orderBy: { codigo: 'asc' },
      });

      const rubros = await prisma.rubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, nombre: true },
      });
      const rubrosMap = new Map<number, number>();
      const rubrosPorNombre = new Map<string, number>();
      rubros.forEach((r) => {
        rubrosMap.set(r.sfactoryId, r.id);
        rubrosPorNombre.set(r.nombre, r.id);
      });

      const subrubros = await prisma.subrubro.findMany({
        where: { empresaId },
        select: { id: true, sfactoryId: true, rubroId: true, nombre: true },
      });
      const subrubrosMap = new Map<number, number>();
      const subrubrosPorRubroNombre = new Map<string, number>();
      subrubros.forEach((s) => {
        subrubrosMap.set(s.sfactoryId, s.id);
        if (s.rubroId != null) {
          subrubrosPorRubroNombre.set(`${s.rubroId}:${s.nombre}`, s.id);
        }
      });

      const productosSfactoryMap = new Map<string, (typeof productosSfactory)[0]>();
      productosSfactory.forEach((p) => {
        productosSfactoryMap.set(p.codigo, p);
      });

      let codigoAgrupacionByCodigo = new Map<string, string>();
      if (codigosAfectados && codigosAfectados.size > 0) {
        const webs = await prisma.productoWeb.findMany({
          where: {
            empresaId,
            sfactoryCodigo: { in: [...codigosAfectados] },
          },
          select: {
            sfactoryCodigo: true,
            productoPadre: { select: { codigoAgrupacion: true } },
          },
        });
        codigoAgrupacionByCodigo = new Map(
          webs.map((w) => [w.sfactoryCodigo, w.productoPadre.codigoAgrupacion])
        );
      }

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
          Stock: null,
          Barcode: p.barcode || null,
          Activo: activo === 'S',
          id: p.sfactory_id || undefined,
          Color: null,
          Talle: null,
        } as SFactoryProduct;
      });

      const grupos = agruparProductosPorCodigoBase(productos);

      let gruposArray = Array.from(grupos.entries());
      let gruposProcesados = gruposArray.length;
      let gruposOmitidos = 0;

      if (codigosAfectados && codigosAfectados.size > 0) {
        const gruposAfectados = resolveGruposAfectados(
          codigosAfectados,
          productosSfactoryMap,
          codigoAgrupacionByCodigo
        );
        gruposArray = gruposArray.filter(([codigoAgrupacion]) =>
          gruposAfectados.has(codigoAgrupacion)
        );
        gruposProcesados = gruposArray.length;
        gruposOmitidos = grupos.size - gruposProcesados;
      }

      if (gruposArray.length === 0) {
        return {
          procesados: productosSfactory.length,
          exitosos: 0,
          fallidos: 0,
          sinCodigo: 0,
          gruposCreados: grupos.size,
          gruposProcesados: 0,
          gruposOmitidos: grupos.size,
          productosPadreCreados: 0,
          productosWebCreados: 0,
          productosWebOmitidos: 0,
        };
      }

      const padresExistentes = await prisma.productoPadre.findMany({
        where: {
          empresaId,
          codigoAgrupacion: { in: gruposArray.map(([c]) => c) },
        },
        select: {
          id: true,
          codigoAgrupacion: true,
          nombre: true,
          descripcion: true,
          rubroId: true,
          subrubroId: true,
          linea: true,
          material: true,
          um: true,
          coloresDisponibles: true,
          tallesDisponibles: true,
          genero: true,
        },
      });
      const padreByAgrupacion = new Map(padresExistentes.map((p) => [p.codigoAgrupacion, p]));

      const websExistentes = await prisma.productoWeb.findMany({
        where: { empresaId },
        select: {
          id: true,
          sfactoryCodigo: true,
          productoPadreId: true,
          sfactoryId: true,
          sfactoryBarcode: true,
          nombre: true,
          sexo: true,
          talle: true,
          color: true,
          precioCache: true,
          stockCache: true,
          activoSfactory: true,
        },
      });
      const webByCodigo = new Map(websExistentes.map((w) => [w.sfactoryCodigo, w]));

      const preciosExistentes = await prisma.productoPrecio.findMany({
        where: {
          tipoCliente: 'minorista',
          productoWebId: { in: websExistentes.map((w) => w.id) },
        },
        select: { productoWebId: true, precioLista: true },
      });
      const precioListaByWebId = new Map(
        preciosExistentes.map((p) => [p.productoWebId, Number(p.precioLista)])
      );

      let exitosos = 0;
      let fallidos = 0;
      let sinCodigo = 0;
      let productosPadreCreados = 0;
      let productosWebCreados = 0;
      let productosWebOmitidos = 0;

      const BATCH_SIZE = 15;
      const TRANSACTION_TIMEOUT = 120000;

      for (let i = 0; i < gruposArray.length; i += BATCH_SIZE) {
        const batch = gruposArray.slice(i, i + BATCH_SIZE);

        await prisma.$transaction(async (tx: PrismaTransaction): Promise<void> => {
          for (const [codigoAgrupacion, grupo] of batch) {
            try {
              if (!codigoAgrupacion || grupo.productos.length === 0) {
                continue;
              }

              const primerProducto = grupo.productos[0]?.producto;
              if (!primerProducto) {
                continue;
              }

              const codigoPrimerProducto = String((primerProducto as any).Codigo || '');
              const productoSfactory = productosSfactoryMap.get(codigoPrimerProducto);

              const nombre = grupo.nombreBase || codigoAgrupacion;
              const descripcionPadre = '';
              const sexoNormalizado = normalizarSexo(grupo.sexo);

              let rubroId = productoSfactory?.rubro_id || null;
              let subrubroId = productoSfactory?.subrubro_id || null;

              if (!rubroId) {
                const rubroNombre = normalizarRubro(
                  productoSfactory?.rubro || (primerProducto as any).Rubro
                );
                if (rubroNombre) {
                  rubroId = rubrosPorNombre.get(rubroNombre) ?? null;
                }
              }

              if (!subrubroId && rubroId) {
                const subrubroNombre = normalizarRubro(
                  productoSfactory?.subrubro || (primerProducto as any).Subrubro
                );
                if (subrubroNombre) {
                  subrubroId = subrubrosPorRubroNombre.get(`${rubroId}:${subrubroNombre}`) ?? null;
                }
              }

              const padrePayload = {
                nombre,
                descripcion: descripcionPadre,
                rubroId,
                subrubroId,
                linea: productoSfactory?.linea || (primerProducto as any).Linea || null,
                material: productoSfactory?.material || (primerProducto as any).Material || null,
                um: productoSfactory?.um || (primerProducto as any).UM || null,
                coloresDisponibles: grupo.colores.length > 0 ? (grupo.colores as any) : null,
                tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
                genero: sexoNormalizado,
              };

              const padreExistente = padreByAgrupacion.get(codigoAgrupacion);
              const padreHash = hashProductoPadreFields(padrePayload);
              const padreSinCambios =
                padreExistente != null &&
                hashProductoPadreFields({
                  nombre: padreExistente.nombre,
                  descripcion: padreExistente.descripcion,
                  rubroId: padreExistente.rubroId,
                  subrubroId: padreExistente.subrubroId,
                  linea: padreExistente.linea,
                  material: padreExistente.material,
                  um: padreExistente.um,
                  coloresDisponibles: padreExistente.coloresDisponibles,
                  tallesDisponibles: padreExistente.tallesDisponibles,
                  genero: padreExistente.genero,
                }) === padreHash;

              let productoPadre = padreExistente;
              if (!padreSinCambios) {
                productoPadre = await tx.productoPadre.upsert({
                  where: {
                    unique_empresa_agrupacion: {
                      empresaId,
                      codigoAgrupacion,
                    },
                  },
                  update: padrePayload,
                  create: {
                    empresaId,
                    codigoAgrupacion,
                    ...padrePayload,
                    slug: generarSlug(nombre, codigoAgrupacion),
                  },
                });
                productosPadreCreados++;
                padreByAgrupacion.set(codigoAgrupacion, productoPadre);
              }

              if (!productoPadre) {
                continue;
              }

              for (const item of grupo.productos) {
                try {
                  const producto = item.producto;
                  const codigoStr = String(
                    (producto as any).Codigo || (producto as any).codigo || ''
                  );

                  if (!codigoStr) {
                    sinCodigo++;
                    continue;
                  }

                  const productoSfactoryItem = productosSfactoryMap.get(codigoStr);

                  let color = item.color;
                  if (!color && productoSfactoryItem) {
                    const parseado = parsearNombreProducto(
                      productoSfactoryItem.descripcion ||
                        productoSfactoryItem.descrip_corta ||
                        codigoStr,
                      codigoStr
                    );
                    color = parseado.color;
                  }

                  const talle = item.talle;
                  const nombreVariante = nombre;
                  const sfactoryId =
                    productoSfactoryItem?.sfactory_id ||
                    (producto as any).id ||
                    (producto as any).Id ||
                    0;

                  const datosProductoWeb = {
                    productoPadreId: productoPadre.id,
                    sfactoryId,
                    sfactoryBarcode:
                      productoSfactoryItem?.barcode || (producto as any).Barcode || null,
                    nombre: nombreVariante,
                    descripcionCompleta: '',
                    sexo: sexoNormalizado,
                    talle,
                    color,
                    precioCache: productoSfactoryItem?.precio_venta
                      ? Number(productoSfactoryItem.precio_venta)
                      : null,
                    stockCache:
                      (producto as any).Stock !== null && (producto as any).Stock !== undefined
                        ? Number((producto as any).Stock)
                        : 0,
                    ultimaSyncSfactory: productoSfactoryItem?.ultima_sync || new Date(),
                    activoSfactory: (productoSfactoryItem?.activo ?? 'S') === 'S',
                  };

                  const webExistente = webByCodigo.get(codigoStr);
                  const webHash = hashProductoWebFields(datosProductoWeb);
                  const webSinCambios =
                    webExistente != null &&
                    hashProductoWebFields({
                      productoPadreId: webExistente.productoPadreId,
                      sfactoryId: webExistente.sfactoryId,
                      sfactoryBarcode: webExistente.sfactoryBarcode,
                      nombre: webExistente.nombre,
                      sexo: webExistente.sexo,
                      talle: webExistente.talle,
                      color: webExistente.color,
                      precioCache: webExistente.precioCache
                        ? Number(webExistente.precioCache)
                        : null,
                      stockCache: webExistente.stockCache
                        ? Number(webExistente.stockCache)
                        : null,
                      activoSfactory: webExistente.activoSfactory,
                    }) === webHash;

                  let productoWeb = webExistente;
                  if (!webSinCambios) {
                    productoWeb = await tx.productoWeb.upsert({
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
                    productosWebCreados++;
                    webByCodigo.set(codigoStr, productoWeb);
                  } else {
                    productosWebOmitidos++;
                  }

                  if (
                    datosProductoWeb.precioCache &&
                    datosProductoWeb.precioCache > 0 &&
                    productoWeb
                  ) {
                    const precioLista = Number(datosProductoWeb.precioCache);
                    const precioActual = precioListaByWebId.get(productoWeb.id);
                    if (precioActual !== precioLista) {
                      try {
                        const preciosDerivados = calcularTodosLosPrecios(
                          precioLista,
                          CUOTAS_FINANCIADO_DEFAULT
                        );
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
                        precioListaByWebId.set(productoWeb.id, precioLista);
                      } catch (error: any) {
                        console.warn(
                          `[procesarProductosDesdeSfactory] Error creando ProductoPrecio para ${codigoStr}:`,
                          error.message
                        );
                      }
                    }
                  }

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
        gruposProcesados,
        gruposOmitidos,
        productosPadreCreados,
        productosWebCreados,
        productosWebOmitidos,
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
        // Si no, obtenerlo de SFactory (items_leer_item requiere item_id)
        try {
          const espejo = await prisma.productoSfactory.findFirst({
            where: { empresaId, codigo },
            select: { sfactory_id: true },
          });
          const sfactoryId = espejo?.sfactory_id;
          if (sfactoryId != null) {
            productoData = await sfactoryService.leerItem({ item_id: sfactoryId });
          } else {
            productoData = await sfactoryService.leerItem({ codigo });
          }
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

    // Resolver rubro_id y subrubro_id locales (Number() por si la API devuelve string)
    const sfactoryRubroId = (producto as any).rubro_id ?? (producto as any).RubroId ?? (producto as any).rubroId ?? null;
    const sfactorySubrubroId = (producto as any).subrubro_id ?? (producto as any).SubrubroId ?? (producto as any).subrubroId ?? null;

    let rubroIdLocal: number | null = null;
    let subrubroIdLocal: number | null = null;

    if (sfactoryRubroId != null) {
      rubroIdLocal = rubrosMap.get(Number(sfactoryRubroId)) ?? null;
      if (!rubroIdLocal) {
        console.warn(`[syncProductoSfactoryIndividual] No se encontró rubro local para sfactoryId: ${sfactoryRubroId}`);
      }
    }

    if (sfactorySubrubroId != null) {
      subrubroIdLocal = subrubrosMap.get(Number(sfactorySubrubroId)) ?? null;
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
        : 0,
      Barcode: productoSfactory.barcode || null,
      Activo: productoSfactory.activo === 'S',
      id: productoSfactory.sfactory_id || undefined,
      Color: null,
      Talle: null,
    };

    // Agrupar: la clave del Map es codigoBase + sufijo sexo (ej. L-OF-BER-REL_H), no solo el código.
    // Buscar el grupo que contiene este SKU original (codigo de productos_sfactory) para que coincida.
    const grupos = agruparProductosPorCodigoBase([productoFormateado]);
    const grupo = Array.from(grupos.values()).find((g) =>
      g.productos.some(
        (p) => String((p.producto as any).Codigo || (p.producto as any).codigo || '') === codigo
      )
    ) ?? Array.from(grupos.values())[0];

    if (!grupo || grupo.productos.length === 0) {
      throw new Error(`No se pudo agrupar el producto ${codigo}`);
    }

    // Usar siempre el codigoAgrupacion del grupo (ej. L-OF-BER-REL_H) para coincidir con productos_padre
    const codigoAgrupacion = grupo.codigoAgrupacion;

    // Procesar el grupo (reutilizar lógica existente)
    const TRANSACTION_TIMEOUT = 120000; // 2 minutos
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
          genero: sexoNormalizado,
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
          genero: sexoNormalizado,
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
            : 0,
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
    const syncSfactory = await this.syncProductosSfactory(empresaId);

    const procesamiento = await this.procesarProductosDesdeSfactory(empresaId, {
      codigosAfectados: syncSfactory.codigosAfectados,
    });

    const resultado = {
      syncSfactory,
      procesamiento,
      resumen: {
        productosSfactory: syncSfactory.procesados,
        productosSfactoryOmitidos: syncSfactory.omitidos,
        productosPadre: procesamiento.productosPadreCreados,
        productosWeb: procesamiento.productosWebCreados,
        productosWebOmitidos: procesamiento.productosWebOmitidos,
        gruposProcesados: procesamiento.gruposProcesados,
        gruposOmitidos: procesamiento.gruposOmitidos,
        exitosos: procesamiento.exitosos,
        fallidos: procesamiento.fallidos + syncSfactory.errores,
      },
    };

    console.log('\n========================================');
    console.log('📦 RESUMEN DE SINCRONIZACIÓN DE PRODUCTOS');
    console.log('========================================\n');
    console.log('📥 PASO 1: Sincronización desde SFactory');
    console.log(`   • Productos procesados: ${syncSfactory.procesados}`);
    console.log(`   • Insertados: ${syncSfactory.insertados}`);
    console.log(`   • Actualizados: ${syncSfactory.actualizados}`);
    console.log(`   • Omitidos (sin cambios): ${syncSfactory.omitidos}`);
    console.log(`   • Códigos afectados paso 2: ${syncSfactory.codigosAfectados.size}`);
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
    console.log(`   • Productos en espejo: ${procesamiento.procesados}`);
    console.log(`   • Grupos totales catálogo: ${procesamiento.gruposCreados}`);
    console.log(`   • Grupos procesados: ${procesamiento.gruposProcesados}`);
    console.log(`   • Grupos omitidos: ${procesamiento.gruposOmitidos}`);
    console.log(`   • Productos padre escritos: ${procesamiento.productosPadreCreados}`);
    console.log(`   • Variantes escritas: ${procesamiento.productosWebCreados}`);
    console.log(`   • Variantes omitidas: ${procesamiento.productosWebOmitidos}`);
    console.log(`   • Exitosos: ${procesamiento.exitosos}`);
    console.log(`   • Fallidos: ${procesamiento.fallidos}`);
    console.log(`   • Sin código: ${procesamiento.sinCodigo}`);
    console.log('\n📊 RESUMEN GENERAL');
    console.log(`   • Total productos SFactory: ${resultado.resumen.productosSfactory}`);
    console.log(`   • Total omitidos paso 1: ${resultado.resumen.productosSfactoryOmitidos}`);
    console.log(`   • Total productos padre escritos: ${resultado.resumen.productosPadre}`);
    console.log(`   • Total variantes escritas: ${resultado.resumen.productosWeb}`);
    console.log(`   • Total variantes omitidas: ${resultado.resumen.productosWebOmitidos}`);
    console.log(`   • Total exitosos: ${resultado.resumen.exitosos}`);
    console.log(`   • Total fallidos: ${resultado.resumen.fallidos}`);
    console.log('========================================\n');

    return resultado;
  }
}

export const productoSyncService = new ProductoSyncService();
