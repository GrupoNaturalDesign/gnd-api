import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  getShippingAltoPorPrendaCm,
  getSubrubroShippingFallback,
} from '../lib/shipping-parcel.config';
import { ShippingValidationError } from '../services/shipping/shipping.errors';
import type { ShippingParcel } from '../services/shipping/shipping.types';

export interface CheckoutShippingItemInput {
  productoWebId: number;
  cantidad: number;
}

export interface ProductShippingLine {
  codigo: string;
  cantidad: number;
  pesoGrams: number | null;
  anchoCm: number | null;
  largoCm: number | null;
  subrubro: string | null;
}

function positiveNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveLineDimensions(line: ProductShippingLine): {
  pesoGrams: number;
  anchoCm: number;
  largoCm: number;
} {
  const fallback = getSubrubroShippingFallback(line.subrubro);
  const anchoCm = positiveNum(line.anchoCm) ?? fallback?.anchoCm ?? null;
  const largoCm = positiveNum(line.largoCm) ?? fallback?.largoCm ?? null;
  const pesoGrams =
    positiveNum(line.pesoGrams) ?? positiveNum(fallback?.pesoGrams) ?? null;

  if (pesoGrams == null) {
    throw new ShippingValidationError(
      `El producto ${line.codigo} no tiene peso configurado. Contactá a GND para cotizar el envío.`
    );
  }
  if (anchoCm == null || largoCm == null) {
    throw new ShippingValidationError(
      `El producto ${line.codigo} no tiene medidas (ancho/largo). Contactá a GND para cotizar el envío.`
    );
  }
  return { pesoGrams, anchoCm, largoCm };
}

/**
 * Arma un bulto virtual desde líneas de producto (peso sumado; volumen por prenda apilada).
 */
export function buildParcelFromShippingLines(
  lines: ProductShippingLine[],
  declaredValue: number
): ShippingParcel {
  if (lines.length === 0) {
    throw new ShippingValidationError('No hay productos para calcular el envío.');
  }

  const altoPrenda = getShippingAltoPorPrendaCm();
  let weightGrams = 0;
  let totalVolumeCm3 = 0;
  let maxAncho = 0;
  let maxLargo = 0;

  for (const line of lines) {
    const qty = positiveNum(line.cantidad);
    if (qty == null) continue;
    const { pesoGrams, anchoCm, largoCm } = resolveLineDimensions(line);
    weightGrams += pesoGrams * qty;
    totalVolumeCm3 += anchoCm * largoCm * altoPrenda * qty;
    maxAncho = Math.max(maxAncho, anchoCm);
    maxLargo = Math.max(maxLargo, largoCm);
  }

  if (weightGrams <= 0 || totalVolumeCm3 <= 0) {
    throw new ShippingValidationError('No se pudo calcular peso o volumen del envío.');
  }

  const width = Math.max(1, Math.round(maxAncho));
  const depth = Math.max(1, Math.round(maxLargo));
  const height = Math.max(
    altoPrenda,
    Math.ceil(totalVolumeCm3 / (width * depth))
  );

  return {
    weightGrams: Math.max(1, Math.round(weightGrams)),
    height: Math.max(1, height),
    width,
    depth,
    declaredValue: Math.max(0, declaredValue),
  };
}

function mapSfactoryRowToLine(
  codigo: string,
  cantidad: number,
  row: {
    peso_bruto: Prisma.Decimal | null;
    ancho: Prisma.Decimal | null;
    largo: Prisma.Decimal | null;
    subrubro: string | null;
  } | undefined
): ProductShippingLine {
  return {
    codigo,
    cantidad,
    pesoGrams: positiveNum(row?.peso_bruto),
    anchoCm: positiveNum(row?.ancho),
    largoCm: positiveNum(row?.largo),
    subrubro: row?.subrubro ?? null,
  };
}

export async function loadProductShippingLines(
  empresaId: number,
  items: CheckoutShippingItemInput[]
): Promise<ProductShippingLine[]> {
  if (items.length === 0) return [];

  const webs = await prisma.productoWeb.findMany({
    where: {
      empresaId,
      id: { in: items.map((i) => i.productoWebId) },
    },
    select: { id: true, sfactoryCodigo: true },
  });
  const webById = new Map(webs.map((w) => [w.id, w]));

  const codigos = [...new Set(webs.map((w) => w.sfactoryCodigo))];
  const sfactoryRows = await prisma.productoSfactory.findMany({
    where: { empresaId, codigo: { in: codigos } },
    select: {
      codigo: true,
      peso_bruto: true,
      ancho: true,
      largo: true,
      subrubro: true,
    },
  });
  const sfByCodigo = new Map(sfactoryRows.map((r) => [r.codigo, r]));

  const lines: ProductShippingLine[] = [];
  for (const item of items) {
    const qty = positiveNum(item.cantidad);
    if (qty == null) continue;
    const web = webById.get(item.productoWebId);
    if (!web) {
      throw new ShippingValidationError(
        `Producto web #${item.productoWebId} no encontrado para calcular envío.`
      );
    }
    lines.push(
      mapSfactoryRowToLine(web.sfactoryCodigo, qty, sfByCodigo.get(web.sfactoryCodigo))
    );
  }
  return lines;
}

export async function loadProductShippingLinesFromPedidoItems(
  empresaId: number,
  items: Array<{
    productoWebId?: number | null;
    codigo: string;
    cantidad: Prisma.Decimal | number | string;
  }>
): Promise<ProductShippingLine[]> {
  if (items.length === 0) return [];

  const webIds = items
    .map((i) => i.productoWebId)
    .filter((id): id is number => id != null && id > 0);

  const webs =
    webIds.length > 0
      ? await prisma.productoWeb.findMany({
          where: { empresaId, id: { in: webIds } },
          select: { id: true, sfactoryCodigo: true },
        })
      : [];
  const webById = new Map(webs.map((w) => [w.id, w]));

  const codigos = new Set<string>();
  for (const item of items) {
    const web = item.productoWebId ? webById.get(item.productoWebId) : null;
    codigos.add(web?.sfactoryCodigo ?? item.codigo.trim());
  }

  const sfactoryRows = await prisma.productoSfactory.findMany({
    where: { empresaId, codigo: { in: [...codigos] } },
    select: {
      codigo: true,
      peso_bruto: true,
      ancho: true,
      largo: true,
      subrubro: true,
    },
  });
  const sfByCodigo = new Map(sfactoryRows.map((r) => [r.codigo, r]));

  const lines: ProductShippingLine[] = [];
  for (const item of items) {
    const qty = positiveNum(item.cantidad);
    if (qty == null) continue;
    const web = item.productoWebId ? webById.get(item.productoWebId) : null;
    const codigo = web?.sfactoryCodigo ?? item.codigo.trim();
    if (!codigo) {
      throw new ShippingValidationError('Ítem de pedido sin código para calcular envío.');
    }
    lines.push(mapSfactoryRowToLine(codigo, qty, sfByCodigo.get(codigo)));
  }
  return lines;
}

export async function buildParcelFromCheckoutItems(
  empresaId: number,
  items: CheckoutShippingItemInput[],
  declaredValue: number
): Promise<ShippingParcel> {
  const lines = await loadProductShippingLines(empresaId, items);
  return buildParcelFromShippingLines(lines, declaredValue);
}

export async function buildParcelFromPedidoItems(
  empresaId: number,
  items: Array<{
    productoWebId?: number | null;
    codigo: string;
    cantidad: Prisma.Decimal | number | string;
  }>,
  declaredValue: number
): Promise<ShippingParcel> {
  const lines = await loadProductShippingLinesFromPedidoItems(empresaId, items);
  return buildParcelFromShippingLines(lines, declaredValue);
}
