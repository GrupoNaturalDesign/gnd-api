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
import { productoPrecioService } from '../productoPrecio.service';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import {
  hashProductoPadreFields,
  hashProductoSfactoryFields,
  hashProductoWebFields,
  mapCodigoToAgrupacionCanonica,
  resolveGruposAfectados,
  resolveGruposDesalineados,
} from '../../utils/sync-hash.utils';
import {
  activoSfactoryDesdeDeposito,
  codigoDesdeItemSfactory,
  obtenerInventarioPorCodigos,
  resolverCodigosPermitidosDeposito,
  type InventarioDepositoRow,
} from '../../utils/sfactory-stock-fetch.utils';
import { activoSfactoryConWhitelist } from '../../config/colores-padre-whitelist.utils';
import { resolverColorDesdeSfactory } from '../../utils/sfactory-color-parse.utils';
import { realinearVariantesAgrupacionCanonica } from '../../utils/sfactory-realign-agrupacion.utils';
import {
  publicarPadresSublineaAlineados,
  refrescarColoresDisponiblesPadres,
  resolverPublicadoPadreNuevo,
} from '../../utils/padre-colores-sync.utils';
import { aliasCodigosAgrupacionPadre } from '../../utils/sku-line-fusion.utils';

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

/** Persiste precio minorista con cuotas vía proveedor (MP) fuera de transacciones largas. */
async function flushPrecioMinoristaFromMp(pending: Map<number, number>): Promise<void> {
  if (pending.size === 0) return;
  for (const [productoWebId, precioLista] of pending) {
    try {
      await productoPrecioService.upsert({
        productoWebId,
        tipoCliente: 'minorista',
        precioLista,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[producto-sync] Error upsert precio MP productoWebId=${productoWebId}:`,
        msg
      );
    }
  }
  pending.clear();
}

/** Primer campo numérico presente en la respuesta cruda de S-Factory (PascalCase / camelCase / snake_case). */
function sfactoryDecimal(producto: any, ...keys: string[]): Prisma.Decimal | null {
  for (const key of keys) {
    const d = toDecimal(producto?.[key]);
    if (d != null) return d;
  }
  return null;
}

type PadreSyncRow = {
  id: number;
  codigoAgrupacion: string;
  nombre: string;
  descripcion: string | null;
  rubroId: number | null;
  subrubroId: number | null;
  linea: string | null;
  material: string | null;
  um: string | null;
  coloresDisponibles: Prisma.JsonValue;
  tallesDisponibles: Prisma.JsonValue;
  genero: string | null;
};

function padresDesdeAliasCodigo(
  codigoAgrupacion: string,
  padreByAgrupacion: Map<string, PadreSyncRow>
): PadreSyncRow[] {
  const porId = new Map<number, PadreSyncRow>();
  for (const alias of aliasCodigosAgrupacionPadre(codigoAgrupacion)) {
    const padre = padreByAgrupacion.get(alias);
    if (padre) porId.set(padre.id, padre);
  }
  return [...porId.values()];
}

async function consolidarPadresEnCanonico(
  tx: PrismaTransaction,
  empresaId: number,
  codigoAgrupacion: string,
  nombre: string,
  candidatos: PadreSyncRow[],
  padreByAgrupacion: Map<string, PadreSyncRow>
): Promise<PadreSyncRow> {
  const canonico = candidatos.reduce((a, b) => (a.id < b.id ? a : b));

  for (const otro of candidatos) {
    if (otro.id === canonico.id) continue;
    await tx.productoWeb.updateMany({
      where: { productoPadreId: otro.id, empresaId },
      data: { productoPadreId: canonico.id },
    });
    await tx.productoPadre.delete({ where: { id: otro.id } });
    padreByAgrupacion.delete(otro.codigoAgrupacion);
  }

  if (canonico.codigoAgrupacion !== codigoAgrupacion) {
    const actualizado = await tx.productoPadre.update({
      where: { id: canonico.id },
      data: {
        codigoAgrupacion,
        slug: generarSlug(nombre, codigoAgrupacion),
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
    padreByAgrupacion.delete(canonico.codigoAgrupacion);
    padreByAgrupacion.set(codigoAgrupacion, actualizado);
    return actualizado;
  }

  padreByAgrupacion.set(codigoAgrupacion, canonico);
  return canonico;
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

      const gruposRemotos = agruparProductosPorCodigoBase(productos);
      const codigosRemotosLista = [
        ...new Set(
          productos
            .map((p) => codigoDesdeItemSfactory(p as { Codigo?: string; codigo?: string }))
            .filter(Boolean)
        ),
      ];

      let codigosPermitidos = new Set<string>(codigosRemotosLista);
      let gruposSinStock = 0;
      let gruposConStock = gruposRemotos.size;
      let llamadasStockInventario = 0;

      if (codigosRemotosLista.length > 0) {
        const { inventarioPorCodigo, llamadasApi } =
          await obtenerInventarioPorCodigos(codigosRemotosLista);
        llamadasStockInventario = llamadasApi;
        const filtroDeposito = resolverCodigosPermitidosDeposito(
          gruposRemotos,
          inventarioPorCodigo
        );
        codigosPermitidos = filtroDeposito.codigosPermitidos;
        gruposSinStock = filtroDeposito.gruposSinStock;
        gruposConStock = filtroDeposito.clavesGrupoConStock.size;
      }

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
          peso_bruto: true,
          ancho: true,
          largo: true,
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
      let omitidosSinStockGrupo = 0;
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

              if (!codigosPermitidos.has(codigo)) {
                omitidosSinStockGrupo++;
                continue;
              }

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
                peso_bruto: sfactoryDecimal(producto, 'PesoBruto', 'pesoBruto', 'peso_bruto'),
                ancho: sfactoryDecimal(producto, 'Ancho', 'ancho'),
                largo: sfactoryDecimal(producto, 'Largo', 'largo'),
                volumen: sfactoryDecimal(producto, 'Volumen', 'volumen'),
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
                peso_bruto: datosProductoSfactory.peso_bruto,
                ancho: datosProductoSfactory.ancho,
                largo: datosProductoSfactory.largo,
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
        omitidosSinStockGrupo,
        gruposSinStock,
        gruposConStock,
        llamadasStockInventario,
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
    options?: { codigosAfectados?: Set<string>; forceReprocess?: boolean }
  ) {
    const pendingPreciosMinorista = new Map<number, number>();
    try {
      const codigosAfectados = options?.forceReprocess ? undefined : options?.codigosAfectados;

      const rubrosEcommerce = await prisma.rubro.findMany({
        where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
        select: { id: true },
      });
      const rubroIdsEcommerce = rubrosEcommerce.map((r) => r.id);

      const productosSfactory = await prisma.productoSfactory.findMany({
        where: {
          empresaId,
          activo: 'S',
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
      const canonicoPorCodigo = mapCodigoToAgrupacionCanonica(grupos);

      const websAgrupacion = await prisma.productoWeb.findMany({
        where: {
          empresaId,
          sfactoryCodigo: { in: [...canonicoPorCodigo.keys()] },
          ...(rubroIdsEcommerce.length > 0 && {
            productoPadre: { rubroId: { in: rubroIdsEcommerce } },
          }),
        },
        select: {
          sfactoryCodigo: true,
          productoPadre: { select: { codigoAgrupacion: true } },
        },
      });
      const gruposDesalineados = resolveGruposDesalineados(
        canonicoPorCodigo,
        websAgrupacion.map((w) => ({
          sfactoryCodigo: w.sfactoryCodigo,
          codigoAgrupacionPadre: w.productoPadre.codigoAgrupacion,
        }))
      );

      if (
        codigosAfectados &&
        codigosAfectados.size === 0 &&
        gruposDesalineados.size === 0
      ) {
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

      let gruposArray = Array.from(grupos.entries());
      let gruposProcesados = gruposArray.length;
      let gruposOmitidos = 0;
      let gruposOmitidosSinStock = 0;

      const codigosParaStock = productos
        .map((p) => codigoDesdeItemSfactory(p as { Codigo?: string; codigo?: string }))
        .filter(Boolean);
      let inventarioPorCodigo = new Map<string, InventarioDepositoRow>();
      let codigosPermitidosDeposito = new Set<string>();
      if (codigosParaStock.length > 0) {
        const inv = await obtenerInventarioPorCodigos(codigosParaStock);
        inventarioPorCodigo = inv.inventarioPorCodigo;
        const filtroDeposito = resolverCodigosPermitidosDeposito(grupos, inventarioPorCodigo);
        codigosPermitidosDeposito = filtroDeposito.codigosPermitidos;
        gruposOmitidosSinStock = filtroDeposito.gruposSinStock;
        const antes = gruposArray.length;
        gruposArray = gruposArray.filter(
          ([clave]) =>
            filtroDeposito.clavesGrupoConStock.has(clave) ||
            gruposDesalineados.has(clave)
        );
        gruposProcesados = gruposArray.length;
        gruposOmitidos += antes - gruposProcesados;

        const codigosFueraDeposito = codigosParaStock.filter(
          (c) => !codigosPermitidosDeposito.has(c)
        );
        if (codigosFueraDeposito.length > 0) {
          await prisma.productoWeb.updateMany({
            where: {
              empresaId,
              sfactoryCodigo: { in: codigosFueraDeposito },
              ...(rubroIdsEcommerce.length > 0 && {
                productoPadre: { rubroId: { in: rubroIdsEcommerce } },
              }),
            },
            data: { activoSfactory: false },
          });
        }
      }

      if (codigosAfectados && codigosAfectados.size > 0) {
        const gruposAfectados = resolveGruposAfectados(
          codigosAfectados,
          productosSfactoryMap,
          codigoAgrupacionByCodigo
        );
        for (const g of gruposDesalineados) {
          gruposAfectados.add(g);
        }
        gruposArray = gruposArray.filter(([codigoAgrupacion]) =>
          gruposAfectados.has(codigoAgrupacion)
        );
        gruposProcesados = gruposArray.length;
        gruposOmitidos = grupos.size - gruposProcesados;
      } else if (gruposDesalineados.size > 0) {
        gruposArray = gruposArray.filter(([codigoAgrupacion]) =>
          gruposDesalineados.has(codigoAgrupacion)
        );
        gruposProcesados = gruposArray.length;
        gruposOmitidos = grupos.size - gruposProcesados;
      }

      if (gruposArray.length === 0) {
        await flushPrecioMinoristaFromMp(pendingPreciosMinorista);
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
      const webByPadreSfactory = new Map<string, (typeof websExistentes)[number]>();
      for (const w of websExistentes) {
        const sfKey = `${w.productoPadreId}:${w.sfactoryId}`;
        const prev = webByPadreSfactory.get(sfKey);
        if (!prev || w.id > prev.id) {
          webByPadreSfactory.set(sfKey, w);
        }
      }

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
                tallesDisponibles: grupo.talles.length > 0 ? (grupo.talles as any) : null,
                genero: sexoNormalizado,
              };

              const padresAlias = padresDesdeAliasCodigo(codigoAgrupacion, padreByAgrupacion);
              let padreExistente =
                padreByAgrupacion.get(codigoAgrupacion) ?? padresAlias[0] ?? null;

              if (padresAlias.length > 1) {
                padreExistente = await consolidarPadresEnCanonico(
                  tx,
                  empresaId,
                  codigoAgrupacion,
                  nombre,
                  padresAlias,
                  padreByAgrupacion
                );
              } else if (
                padreExistente &&
                padreExistente.codigoAgrupacion !== codigoAgrupacion
              ) {
                padreExistente = await consolidarPadresEnCanonico(
                  tx,
                  empresaId,
                  codigoAgrupacion,
                  nombre,
                  [padreExistente],
                  padreByAgrupacion
                );
              }

              const padreHash = hashProductoPadreFields({
                ...padrePayload,
                coloresDisponibles: padreExistente?.coloresDisponibles ?? null,
              });
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
                const publicadoNuevo = padreExistente
                  ? undefined
                  : await resolverPublicadoPadreNuevo(tx, empresaId, codigoAgrupacion);
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
                    ...(publicadoNuevo !== undefined && { publicado: publicadoNuevo }),
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

                  let talle = item.talle;
                  const descripcionVariante =
                    productoSfactoryItem?.descripcion ||
                    productoSfactoryItem?.descrip_corta ||
                    codigoStr;
                  let color = resolverColorDesdeSfactory(
                    descripcionVariante,
                    null,
                    item.color,
                    codigoStr
                  );
                    if (productoSfactoryItem) {
                    const parseado = parsearNombreProducto(
                      descripcionVariante,
                      codigoStr
                    );
                    color = resolverColorDesdeSfactory(
                      descripcionVariante,
                      parseado.color,
                      item.color,
                      codigoStr
                    );
                    // Siempre preferir parseo desde descripción SF (evita pisar M→OS por agrupación vieja)
                    if (parseado.talle != null) {
                      talle = parseado.talle;
                    } else if (!talle) {
                      talle = null;
                    }
                  }
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
                    activoSfactory: activoSfactoryConWhitelist(
                      codigoAgrupacion,
                      color,
                      inventarioPorCodigo.size > 0
                        ? activoSfactoryDesdeDeposito(codigoStr, inventarioPorCodigo)
                        : (productoSfactoryItem?.activo ?? 'S') === 'S'
                    ),
                  };

                  const webExistente =
                    webByPadreSfactory.get(`${productoPadre.id}:${datosProductoWeb.sfactoryId}`) ??
                    webByCodigo.get(codigoStr);
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
                    const sfKey = `${productoPadre.id}:${datosProductoWeb.sfactoryId}`;
                    if (webExistente) {
                      const codigoAnterior = webExistente.sfactoryCodigo;
                      productoWeb = await tx.productoWeb.update({
                        where: { id: webExistente.id },
                        data: {
                          ...datosProductoWeb,
                          sfactoryCodigo: codigoStr,
                          productoPadreId: productoPadre.id,
                        },
                      });
                      if (codigoAnterior !== codigoStr) {
                        webByCodigo.delete(codigoAnterior);
                      }
                    } else {
                      productoWeb = await tx.productoWeb.create({
                        data: {
                          empresaId,
                          sfactoryCodigo: codigoStr,
                          ...datosProductoWeb,
                        },
                      });
                      productosWebCreados++;
                    }
                    webByCodigo.set(codigoStr, productoWeb);
                    webByPadreSfactory.set(sfKey, productoWeb);
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
                      pendingPreciosMinorista.set(productoWeb.id, precioLista);
                      precioListaByWebId.set(productoWeb.id, precioLista);
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

      const realineacion = await prisma.$transaction(
        async (tx) =>
          realinearVariantesAgrupacionCanonica(
            tx,
            empresaId,
            productosSfactoryMap,
            rubroIdsEcommerce
          ),
        { timeout: TRANSACTION_TIMEOUT, maxWait: TRANSACTION_TIMEOUT }
      );
      if (realineacion.variantesMovidas > 0 || realineacion.coloresActualizados > 0) {
        console.log(
          `[procesarProductosDesdeSfactory] Realineación: ${realineacion.variantesMovidas} variantes movidas, ${realineacion.coloresActualizados} colores actualizados, ${realineacion.padresTocados} padres`
        );
      }

      const publicadosSub = await publicarPadresSublineaAlineados(prisma, empresaId);
      const coloresPadres = await refrescarColoresDisponiblesPadres(
        prisma,
        empresaId,
        rubroIdsEcommerce
      );
      if (publicadosSub.publicados > 0 || coloresPadres.padresActualizados > 0) {
        console.log(
          `[procesarProductosDesdeSfactory] Padres sublínea publicados: ${publicadosSub.publicados}; colores_disponibles refrescados: ${coloresPadres.padresActualizados}`
        );
      }

      await flushPrecioMinoristaFromMp(pendingPreciosMinorista);

      return {
        procesados: productosSfactory.length,
        exitosos,
        fallidos,
        sinCodigo,
        gruposCreados: grupos.size,
        gruposProcesados,
        gruposOmitidos,
        gruposOmitidosSinStock,
        productosPadreCreados,
        productosWebCreados,
        productosWebOmitidos,
        realineacion,
        publicadosSublinea: publicadosSub.publicados,
        coloresPadresRefrescados: coloresPadres.padresActualizados,
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
      peso_bruto: sfactoryDecimal(producto, 'PesoBruto', 'pesoBruto', 'peso_bruto'),
      ancho: sfactoryDecimal(producto, 'Ancho', 'ancho'),
      largo: sfactoryDecimal(producto, 'Largo', 'largo'),
      volumen: sfactoryDecimal(producto, 'Volumen', 'volumen'),
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
    const pendingPreciosMinorista = new Map<number, number>();
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

    const codigosGrupo = new Set(
      grupo.productos
        .map((p) => codigoDesdeItemSfactory(p.producto as { Codigo?: string; codigo?: string }))
        .filter(Boolean)
    );
    const padrePrevio = await prisma.productoPadre.findFirst({
      where: { empresaId, codigoAgrupacion },
      select: {
        productosWeb: { select: { sfactoryCodigo: true } },
      },
    });
    for (const w of padrePrevio?.productosWeb ?? []) {
      if (w.sfactoryCodigo) codigosGrupo.add(w.sfactoryCodigo);
    }
    const { inventarioPorCodigo } = await obtenerInventarioPorCodigos([...codigosGrupo]);

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

        let talle = item.talle;
        const descripcionVariante =
          productoSfactory.descripcion || productoSfactory.descrip_corta || codigoStr;
        const parseado = parsearNombreProducto(descripcionVariante, codigoStr);
        const color = resolverColorDesdeSfactory(
          descripcionVariante,
          parseado.color,
          item.color,
          codigoStr
        );
        if (parseado.talle != null) {
          talle = parseado.talle;
        } else if (!talle) {
          talle = null;
        }
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
          activoSfactory: activoSfactoryConWhitelist(
            codigoAgrupacion,
            color,
            inventarioPorCodigo.size > 0
              ? activoSfactoryDesdeDeposito(codigoStr, inventarioPorCodigo)
              : productoSfactory.activo === 'S'
          ),
        };

        const existentePorSfactory = await tx.productoWeb.findFirst({
          where: {
            empresaId,
            productoPadreId: productoPadre.id,
            sfactoryId,
          },
          orderBy: { id: 'desc' },
        });

        const productoWeb = existentePorSfactory
          ? await tx.productoWeb.update({
              where: { id: existentePorSfactory.id },
              data: {
                ...datosProductoWeb,
                sfactoryCodigo: codigoStr,
                productoPadreId: productoPadre.id,
              },
            })
          : await tx.productoWeb.upsert({
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
          pendingPreciosMinorista.set(productoWeb.id, Number(datosProductoWeb.precioCache));
        }
      }
    }, {
      timeout: TRANSACTION_TIMEOUT,
      maxWait: TRANSACTION_TIMEOUT,
    });

    await flushPrecioMinoristaFromMp(pendingPreciosMinorista);
  }

  /**
   * Método principal que ejecuta ambos pasos
   */
  async syncProductos(empresaId: number = 1, options?: { forceReprocess?: boolean }) {
    const syncSfactory = await this.syncProductosSfactory(empresaId);

    const procesamiento = await this.procesarProductosDesdeSfactory(empresaId, {
      codigosAfectados: syncSfactory.codigosAfectados,
      forceReprocess: options?.forceReprocess,
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
    console.log(`   • Omitidos (grupo sin stock en depósito): ${syncSfactory.omitidosSinStockGrupo ?? 0}`);
    console.log(`   • Grupos con stock: ${syncSfactory.gruposConStock ?? 0}`);
    console.log(`   • Grupos sin stock (omitidos): ${syncSfactory.gruposSinStock ?? 0}`);
    console.log(`   • Consultas inventario (lotes): ${syncSfactory.llamadasStockInventario ?? 0}`);
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
    console.log(`   • Grupos omitidos por sin stock: ${procesamiento.gruposOmitidosSinStock ?? 0}`);
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
