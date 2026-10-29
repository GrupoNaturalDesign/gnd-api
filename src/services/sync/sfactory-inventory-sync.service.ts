import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { ECOMMERCE_RUBROS_SFACTORY_IDS } from '../../config/ecommerce.config';
import {
  activoSfactoryConWhitelist,
  listarColoresAprobadosPorPadreIds,
} from '../../config/colores-padre-whitelist.utils';
import {
  esBloqueoPorWhitelist,
  registrarBloqueoWhitelist,
  type VarianteBloqueadaWhitelist,
} from '../../utils/variante-whitelist-report.utils';
import {
  publicarPadresSublineaAlineados,
  refrescarColoresDisponiblesPadres,
} from '../../utils/padre-colores-sync.utils';
import { getDbWriteConcurrency } from '../../lib/db-config';
import { sfactoryService } from '../sfactory/sfactory.service';
import { productoPrecioService } from '../productoPrecio.service';
import { shouldUpdateStockPrecio } from '../../utils/sync-hash.utils';
import {
  activoSfactoryDesdeDeposito,
  getEcommerceWarehouseId,
  type InventarioDepositoRow,
} from '../../utils/sfactory-stock-fetch.utils';
import {
  buildInventoryChangedParameters,
  normalizeInventoryChangedRows,
  type InventorySyncMode,
  type NormalizedInventoryChangedRow,
} from '../../utils/sfactory-inventory-delta.utils';
import { getReservasActivasPorProductoWebId, computeStockCacheConReservas } from './stock-reservas.util';

const LOCK_TTL_MS = 30 * 60 * 1000;

export interface SfactoryInventorySyncResult {
  warehouseId: number;
  mode: InventorySyncMode;
  changedSince: string | null;
  rowsReceived: number;
  nextCursorAt: string | null;
  skippedDueToLock: boolean;
  codigosConsultados: number;
  variantesActualizadas: number;
  variantesOmitidas: number;
  preciosActualizados: number;
  lotes: number;
  llamadasApi: number;
  codigosOmitidos: string[];
  variantesDesactivadas: number;
  variantesActivadas: number;
  padresDespublicados: number;
  variantesBloqueadasPorWhitelist: number;
  detalleBloqueadasWhitelist: VarianteBloqueadaWhitelist[];
}

type ApplyStats = {
  variantesActualizadas: number;
  variantesOmitidas: number;
  preciosActualizados: number;
  variantesDesactivadas: number;
  variantesActivadas: number;
  padresDespublicados: number;
  variantesBloqueadasPorWhitelist: number;
  detalleBloqueadasWhitelist: VarianteBloqueadaWhitelist[];
};

async function runPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  const concurrency = Math.max(1, getDbWriteConcurrency());
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

function emptyStats(): ApplyStats {
  return {
    variantesActualizadas: 0,
    variantesOmitidas: 0,
    preciosActualizados: 0,
    variantesDesactivadas: 0,
    variantesActivadas: 0,
    padresDespublicados: 0,
    variantesBloqueadasPorWhitelist: 0,
    detalleBloqueadasWhitelist: [],
  };
}

export async function obtenerInventarioLocalPorCodigos(
  empresaId: number,
  codigos: string[],
  warehouseId?: number
): Promise<Map<string, InventarioDepositoRow>> {
  const wid = warehouseId ?? getEcommerceWarehouseId();
  const uniqueCodes = [...new Set(codigos.map((code) => code.trim()).filter(Boolean))];
  const result = new Map<string, InventarioDepositoRow>();
  for (const code of uniqueCodes) result.set(code, { stock: 0, salePrice: null });
  if (uniqueCodes.length === 0) return result;

  const rows = await prisma.sfactoryInventoryItem.findMany({
    where: { empresaId, warehouseId: wid, itemCode: { in: uniqueCodes } },
    select: { itemCode: true, stock: true, salePrice: true },
  });
  for (const row of rows) {
    result.set(row.itemCode, {
      stock: Number(row.stock),
      salePrice: row.salePrice == null ? null : Number(row.salePrice),
    });
  }
  return result;
}

export class SfactoryInventorySyncService {
  private async ensureState(empresaId: number, warehouseId: number) {
    return prisma.sfactoryInventorySyncState.upsert({
      where: { empresaId_warehouseId: { empresaId, warehouseId } },
      create: { empresaId, warehouseId },
      update: {},
    });
  }

  private async acquireLock(empresaId: number, warehouseId: number): Promise<string | null> {
    await this.ensureState(empresaId, warehouseId);
    const token = crypto.randomUUID();
    const now = new Date();
    const acquired = await prisma.sfactoryInventorySyncState.updateMany({
      where: {
        empresaId,
        warehouseId,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        lockToken: token,
        lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
      },
    });
    return acquired.count === 1 ? token : null;
  }

  private async releaseLock(empresaId: number, warehouseId: number, token: string): Promise<void> {
    await prisma.sfactoryInventorySyncState.updateMany({
      where: { empresaId, warehouseId, lockToken: token },
      data: { lockToken: null, lockedUntil: null },
    });
  }

  private async saveInventoryCache(
    empresaId: number,
    warehouseId: number,
    rows: NormalizedInventoryChangedRow[],
    fullSnapshot: boolean,
    seenAt: Date
  ): Promise<void> {
    await runPool(rows, async (row) => {
      await prisma.sfactoryInventoryItem.upsert({
        where: {
          empresaId_warehouseId_itemCode: {
            empresaId,
            warehouseId,
            itemCode: row.itemCode,
          },
        },
        create: {
          empresaId,
          warehouseId,
          itemCode: row.itemCode,
          stock: new Prisma.Decimal(row.stock),
          salePrice: row.salePrice == null ? null : new Prisma.Decimal(row.salePrice),
          sourceUpdatedAt: row.sourceUpdatedAt,
          lastSeenAt: seenAt,
        },
        update: {
          stock: new Prisma.Decimal(row.stock),
          salePrice: row.salePrice == null ? null : new Prisma.Decimal(row.salePrice),
          sourceUpdatedAt: row.sourceUpdatedAt,
          lastSeenAt: seenAt,
        },
      });
    });

    if (fullSnapshot) {
      const codes = rows.map((row) => row.itemCode);
      await prisma.sfactoryInventoryItem.updateMany({
        where: {
          empresaId,
          warehouseId,
          ...(codes.length > 0 ? { itemCode: { notIn: codes } } : {}),
        },
        data: { stock: new Prisma.Decimal(0), salePrice: null },
      });
    }
  }

  private async applyRowsToProducts(
    empresaId: number,
    rows: NormalizedInventoryChangedRow[],
    fullSnapshot: boolean
  ): Promise<ApplyStats> {
    const stats = emptyStats();
    const remoteByCode = new Map(rows.map((row) => [row.itemCode, row]));
    const rubros = await prisma.rubro.findMany({
      where: { empresaId, sfactoryId: { in: ECOMMERCE_RUBROS_SFACTORY_IDS } },
      select: { id: true },
    });
    const rubroIds = rubros.map((row) => row.id);
    if (rubroIds.length === 0) return stats;

    const variants = await prisma.productoWeb.findMany({
      where: {
        empresaId,
        productoPadre: { rubroId: { in: rubroIds } },
        ...(!fullSnapshot ? { sfactoryCodigo: { in: [...remoteByCode.keys()] } } : {}),
      },
      select: {
        id: true,
        productoPadreId: true,
        sfactoryCodigo: true,
        color: true,
        stockCache: true,
        precioCache: true,
        activoSfactory: true,
        productoPadre: { select: { codigoAgrupacion: true } },
      },
    });
    if (variants.length === 0) return stats;

    const reservas = await getReservasActivasPorProductoWebId(
      empresaId,
      variants.map((variant) => variant.id)
    );
    const approvedColors = await listarColoresAprobadosPorPadreIds(
      [...new Set(variants.map((variant) => variant.productoPadreId))]
    );
    const blockedSeen = new Set<string>();

    await runPool(variants, async (variant) => {
      const remote = remoteByCode.get(variant.sfactoryCodigo) ?? {
        itemCode: variant.sfactoryCodigo,
        warehouseId: null,
        stock: 0,
        salePrice: null,
        sourceUpdatedAt: null,
      };
      const stock = computeStockCacheConReservas(
        remote.stock,
        reservas.get(variant.id)
      );
      const decision = shouldUpdateStockPrecio(
        { stockCache: variant.stockCache, precioCache: variant.precioCache },
        { stock, saleOk: remote.salePrice }
      );
      const inventoryForCode = new Map<string, InventarioDepositoRow>([[
        variant.sfactoryCodigo,
        { stock: remote.stock, salePrice: remote.salePrice },
      ]]);
      const activeInWarehouse = activoSfactoryDesdeDeposito(
        variant.sfactoryCodigo,
        inventoryForCode
      );
      const extraApproved = approvedColors.get(variant.productoPadreId) ?? new Set();
      if (
        esBloqueoPorWhitelist(
          variant.productoPadre.codigoAgrupacion,
          variant.color,
          activeInWarehouse,
          extraApproved
        )
      ) {
        registrarBloqueoWhitelist(stats.detalleBloqueadasWhitelist, blockedSeen, {
          codigoAgrupacion: variant.productoPadre.codigoAgrupacion,
          sfactoryCodigo: variant.sfactoryCodigo,
          color: variant.color ?? '',
          stock: remote.stock,
        });
      }
      const shouldBeActive = activoSfactoryConWhitelist(
        variant.productoPadre.codigoAgrupacion,
        variant.color,
        activeInWarehouse,
        extraApproved
      );
      const activeChanged = shouldBeActive !== variant.activoSfactory;

      if (decision.skip && !activeChanged) {
        stats.variantesOmitidas++;
        return;
      }
      const data: Prisma.ProductoWebUpdateInput = { ultimaSyncSfactory: new Date() };
      if (decision.updateStock) data.stockCache = new Prisma.Decimal(stock);
      if (decision.updatePrecio && remote.salePrice != null) {
        data.precioCache = new Prisma.Decimal(remote.salePrice);
      }
      if (activeChanged) data.activoSfactory = shouldBeActive;
      await prisma.productoWeb.update({ where: { id: variant.id }, data });

      if (decision.updatePrecio && remote.salePrice != null) {
        await productoPrecioService.upsert({
          productoWebId: variant.id,
          tipoCliente: 'minorista',
          precioLista: remote.salePrice,
        });
        stats.preciosActualizados++;
      }
      if (activeChanged) {
        if (shouldBeActive) stats.variantesActivadas++;
        else stats.variantesDesactivadas++;
      }
      stats.variantesActualizadas++;
    });

    stats.variantesBloqueadasPorWhitelist = blockedSeen.size;
    const affectedParentIds = [...new Set(variants.map((variant) => variant.productoPadreId))];
    await publicarPadresSublineaAlineados(prisma, empresaId);
    await refrescarColoresDisponiblesPadres(prisma, empresaId, rubroIds, affectedParentIds);

    if (
      process.env.SYNC_DESPUBLICAR_PADRES_SIN_VENDIBLES === 'true' &&
      affectedParentIds.length > 0
    ) {
      const parents = await prisma.productoPadre.findMany({
        where: { empresaId, id: { in: affectedParentIds }, publicado: true },
        select: {
          id: true,
          productosWeb: {
            where: { activoSfactory: true },
            select: { stockCache: true, precioCache: true },
          },
        },
      });
      const withoutSellable = parents
        .filter((parent) => !parent.productosWeb.some(
          (variant) => Number(variant.stockCache ?? 0) > 0 && Number(variant.precioCache ?? 0) > 0
        ))
        .map((parent) => parent.id);
      if (withoutSellable.length > 0) {
        const updated = await prisma.productoPadre.updateMany({
          where: { id: { in: withoutSellable } },
          data: { publicado: false },
        });
        stats.padresDespublicados = updated.count;
      }
    }
    return stats;
  }

  async sync(
    empresaId: number,
    warehouseId?: number
  ): Promise<SfactoryInventorySyncResult> {
    const wid = warehouseId ?? getEcommerceWarehouseId();
    const token = await this.acquireLock(empresaId, wid);
    const existingState = await this.ensureState(empresaId, wid);
    if (!token) {
      return {
        warehouseId: wid,
        mode: existingState.cursorAt ? 'incremental' : 'initial',
        changedSince: null,
        rowsReceived: 0,
        nextCursorAt: existingState.cursorAt?.toISOString() ?? null,
        skippedDueToLock: true,
        codigosConsultados: 0,
        ...emptyStats(),
        lotes: 0,
        llamadasApi: 0,
        codigosOmitidos: [],
      };
    }

    const requestStartedAt = new Date();
    const request = buildInventoryChangedParameters({
      warehouseId: wid,
      cursorAt: existingState.cursorAt,
    });
    try {
      const response = await sfactoryService.inventoryStockItemsChangedSince(request.parameters);
      const rows = normalizeInventoryChangedRows(
        Array.isArray(response?.data) ? response.data : [],
        wid
      );
      if (request.mode === 'initial' && rows.length === 0) {
        throw new Error(
          'S-Factory devolvió un snapshot inicial vacío; no se avanzó el cursor ni se modificó el inventario local.'
        );
      }
      await this.saveInventoryCache(
        empresaId,
        wid,
        rows,
        request.mode === 'initial',
        requestStartedAt
      );
      const stats = await this.applyRowsToProducts(
        empresaId,
        rows,
        request.mode === 'initial'
      );
      await prisma.sfactoryInventorySyncState.update({
        where: { empresaId_warehouseId: { empresaId, warehouseId: wid } },
        data: {
          cursorAt: requestStartedAt,
          initializedAt: existingState.initializedAt ?? requestStartedAt,
          lastSuccessAt: new Date(),
          lastError: null,
        },
      });
      return {
        warehouseId: wid,
        mode: request.mode,
        changedSince:
          'changed_since' in request.parameters ? request.parameters.changed_since : null,
        rowsReceived: rows.length,
        nextCursorAt: requestStartedAt.toISOString(),
        skippedDueToLock: false,
        codigosConsultados: rows.length,
        ...stats,
        lotes: 1,
        llamadasApi: 1,
        codigosOmitidos: [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await prisma.sfactoryInventorySyncState.updateMany({
          where: { empresaId, warehouseId: wid, lockToken: token },
          data: { lastError: message.slice(0, 10_000) },
        });
      } catch (stateError) {
        console.error('[sfactory-inventory-sync] no se pudo persistir lastError:', stateError);
      }
      throw error;
    } finally {
      try {
        await this.releaseLock(empresaId, wid, token);
      } catch (releaseError) {
        console.error('[sfactory-inventory-sync] no se pudo liberar el lease:', releaseError);
      }
    }
  }

  async ensureInitialized(empresaId: number, warehouseId?: number): Promise<void> {
    const wid = warehouseId ?? getEcommerceWarehouseId();
    const state = await this.ensureState(empresaId, wid);
    if (state.initializedAt) return;
    const result = await this.sync(empresaId, wid);
    if (result.skippedDueToLock) {
      throw new Error('La inicialización de inventario S-Factory ya está en curso.');
    }
  }
}

export const sfactoryInventorySyncService = new SfactoryInventorySyncService();
