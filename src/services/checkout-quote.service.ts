import { FormaEnvio, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import {
  computeCheckoutProductosACobrar,
  computeCheckoutTotalACobrar,
  type CheckoutPriceMode,
} from './checkout-pedido-lifecycle.service';
import {
  resolveCheckoutEnvioPricing,
  type CheckoutEnvioClientPayload,
  type CheckoutShippingItemInput,
} from './checkout-shipping.service';
import { CuponEngineService } from './cupon-engine.service';
import type { ItemInput } from './mp-checkout.service';
import {
  assertMpPricingMode,
  expectedUnitPriceForMpMode,
  type MpPricingMode,
} from '../utils/checkout-mp-pricing.util';
import type { CheckoutEnvioSelectionInput } from '../utils/checkout-envio-parse.util';

const cuponEngine = new CuponEngineService();

/** Máximo de ítems en checkout minorista (espejo de client SALES_CONFIG). */
export const CHECKOUT_MAX_MINORISTA_ITEMS = 20;

export function getCheckoutQuoteExpiresMinutes(): number {
  const raw = process.env.CHECKOUT_QUOTE_EXPIRES_MINUTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 120);
  return 15;
}

export interface CheckoutQuoteItemInput {
  productoWebId: number;
  cantidad: number;
  talle?: string;
  color?: string;
  bordado?: boolean;
}

export interface BuildCheckoutQuoteInput {
  empresaId: number;
  items: CheckoutQuoteItemInput[];
  checkoutEnvio?: CheckoutEnvioSelectionInput;
  /** mercado_pago | manual (efectivo/transferencia) */
  paymentKind: 'mercado_pago' | 'manual';
  mpPricingMode?: MpPricingMode;
  manualFormaPago?: 'efectivo' | 'transferencia';
  cuponCodigo?: string;
}

export interface CheckoutQuoteLineDto {
  productoWebId: number;
  nombre: string;
  codigo: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  talle?: string;
  color?: string;
  bordado?: boolean;
}

export interface CheckoutQuoteResultDto {
  quoteId: string;
  expiresAt: string;
  moneda: 'ARS';
  lineas: CheckoutQuoteLineDto[];
  subtotalProductos: number;
  descuentoCupon: number;
  costoEnvio: number;
  totalFinal: number;
  mpPricingMode?: MpPricingMode;
  paymentKind: 'mercado_pago' | 'manual';
  manualFormaPago?: 'efectivo' | 'transferencia';
}

/** Snapshot persistido para confirmar pedido sin reenviar precios del cliente. */
export interface CheckoutQuoteSnapshot {
  version: 1;
  empresaId: number;
  items: ItemInput[];
  checkoutEnvio?: CheckoutEnvioClientPayload;
  checkoutEnvioSnapshot?: Prisma.InputJsonValue;
  formaEnvio?: FormaEnvio | null;
  cuponCodigo?: string;
  mpPricingMode?: MpPricingMode;
  paymentKind: 'mercado_pago' | 'manual';
  manualFormaPago?: 'efectivo' | 'transferencia';
  subtotalProductos: number;
  descuentoCupon: number;
  costoEnvio: number;
  totalFinal: number;
}

/** Totales finales del checkout (función pura, testeable). */
export function computeCheckoutQuoteTotals(
  subtotalPedido: number,
  descuentoCupon: number,
  costoEnvio: number
): { subtotalProductos: number; totalFinal: number } {
  return {
    subtotalProductos: computeCheckoutProductosACobrar(subtotalPedido, descuentoCupon),
    totalFinal: computeCheckoutTotalACobrar(subtotalPedido, descuentoCupon, costoEnvio),
  };
}

function resolvePriceModeForQuote(input: BuildCheckoutQuoteInput): CheckoutPriceMode {
  if (input.paymentKind === 'manual') return 'transfer';
  return input.mpPricingMode === 'transfer' ? 'transfer' : 'lista';
}

function resolveMpModeForQuote(input: BuildCheckoutQuoteInput): MpPricingMode | undefined {
  if (input.paymentKind !== 'mercado_pago') return undefined;
  return assertMpPricingMode(input.mpPricingMode);
}

export async function resolveCheckoutItemsFromDb(
  empresaId: number,
  rawItems: CheckoutQuoteItemInput[],
  priceMode: CheckoutPriceMode
): Promise<ItemInput[]> {
  if (!rawItems.length) {
    throw new Error('El pedido debe incluir al menos un ítem');
  }

  const mpMode: MpPricingMode = priceMode === 'transfer' ? 'transfer' : 'financiado';
  const ids = [...new Set(rawItems.map((i) => i.productoWebId))];

  const webs = await prisma.productoWeb.findMany({
    where: { empresaId, id: { in: ids } },
    select: {
      id: true,
      productoPadreId: true,
      sfactoryId: true,
      sfactoryCodigo: true,
      nombre: true,
    },
  });
  const webById = new Map(webs.map((w) => [w.id, w]));

  const precios = await prisma.productoPrecio.findMany({
    where: { productoWebId: { in: ids }, tipoCliente: 'minorista' },
  });
  const precioByWebId = new Map(precios.map((p) => [p.productoWebId, p]));

  const resolved: ItemInput[] = [];
  for (const raw of rawItems) {
    const qty = Number(raw.cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Cantidad inválida en ítem del carrito');
    }
    const web = webById.get(raw.productoWebId);
    if (!web) {
      throw new Error(`Producto web #${raw.productoWebId} no encontrado`);
    }
    const row = precioByWebId.get(raw.productoWebId);
    if (!row) {
      throw new Error(`Precio no encontrado para productoWebId ${raw.productoWebId}`);
    }
    const lista = Number(row.precioLista);
    const transfer = row.precioTransfer != null ? Number(row.precioTransfer) : null;
    const precioUnitario = expectedUnitPriceForMpMode(lista, transfer, mpMode);

    resolved.push({
      productoWebId: web.id,
      productoPadreId: web.productoPadreId,
      sfactoryItemId: web.sfactoryId,
      nombre: web.nombre,
      codigo: web.sfactoryCodigo.trim() || String(web.id),
      cantidad: qty,
      precioUnitario,
      talle: raw.talle,
      color: raw.color,
      bordado: raw.bordado === true,
    });
  }
  return resolved;
}

function mapOrderItemsForShippingParcel(items: ItemInput[]): CheckoutShippingItemInput[] {
  return items.map((i) => ({
    productoWebId: i.productoWebId,
    cantidad: i.cantidad,
  }));
}

async function resolveCuponForQuote(
  empresaId: number,
  usuarioId: number,
  cuponCodigo: string | undefined,
  items: ItemInput[]
): Promise<{ descuento: number; codigo?: string }> {
  if (!cuponCodigo?.trim()) {
    return { descuento: 0 };
  }
  const itemsParaValidar = items.map((it) => ({
    productoId: it.productoWebId,
    productoWebId: it.productoWebId,
    productoPadreId: it.productoPadreId,
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
  }));
  const subtotalCalc = itemsParaValidar.reduce(
    (sum, i) => sum + i.precioUnitario * i.cantidad,
    0
  );
  const result = await cuponEngine.validarCupon({
    empresaId,
    codigo: cuponCodigo.trim(),
    usuarioId,
    items: itemsParaValidar,
    subtotal: subtotalCalc,
  });
  if (!result.valido || !result.detalle) {
    throw new Error(result.error ?? 'El cupón no es válido para este pedido');
  }
  return { descuento: Number(result.detalle.descuentoTotal), codigo: cuponCodigo.trim() };
}

export function assertMinoristaItemLimit(items: CheckoutQuoteItemInput[]): void {
  const totalQty = items.reduce((acc, i) => acc + Math.max(0, Number(i.cantidad) || 0), 0);
  if (totalQty > CHECKOUT_MAX_MINORISTA_ITEMS) {
    throw new Error(
      `El checkout minorista admite hasta ${CHECKOUT_MAX_MINORISTA_ITEMS} artículos por pedido.`
    );
  }
}

export async function buildCheckoutQuote(
  input: BuildCheckoutQuoteInput,
  usuarioId: number
): Promise<{
  dto: CheckoutQuoteResultDto;
  snapshot: CheckoutQuoteSnapshot;
  expiresAt: Date;
  quoteId: string;
}> {
  assertMinoristaItemLimit(input.items);

  const priceMode = resolvePriceModeForQuote(input);
  const mpPricingMode = resolveMpModeForQuote(input);
  const items = await resolveCheckoutItemsFromDb(input.empresaId, input.items, priceMode);

  let subtotalPedido = 0;
  const lineas: CheckoutQuoteLineDto[] = [];
  for (const item of items) {
    const subtotal = item.cantidad * item.precioUnitario;
    subtotalPedido += subtotal;
    lineas.push({
      productoWebId: item.productoWebId,
      nombre: item.nombre,
      codigo: item.codigo,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: Number(subtotal.toFixed(2)),
      ...(item.talle ? { talle: item.talle } : {}),
      ...(item.color ? { color: item.color } : {}),
      ...(item.bordado ? { bordado: true } : {}),
    });
  }

  const cupon = await resolveCuponForQuote(
    input.empresaId,
    usuarioId,
    input.cuponCodigo,
    items
  );

  let costoEnvio = 0;
  let checkoutEnvio: CheckoutEnvioClientPayload | undefined;
  let checkoutEnvioSnapshot: Prisma.InputJsonValue | undefined;
  let formaEnvio: FormaEnvio | null = null;

  if (input.checkoutEnvio) {
    const envio = await resolveCheckoutEnvioPricing(
      input.empresaId,
      input.checkoutEnvio,
      mapOrderItemsForShippingParcel(items),
      subtotalPedido
    );
    costoEnvio = Number(envio.costoEnvio.toString());
    checkoutEnvio = envio.checkoutEnvio;
    checkoutEnvioSnapshot = envio.snapshot;
    formaEnvio = envio.formaEnvio;
  }

  const { subtotalProductos, totalFinal } = computeCheckoutQuoteTotals(
    subtotalPedido,
    cupon.descuento,
    costoEnvio
  );

  const quoteId = randomUUID();
  const expiresAt = new Date(Date.now() + getCheckoutQuoteExpiresMinutes() * 60 * 1000);

  const snapshot: CheckoutQuoteSnapshot = {
    version: 1,
    empresaId: input.empresaId,
    items,
    checkoutEnvio,
    checkoutEnvioSnapshot,
    formaEnvio,
    cuponCodigo: cupon.codigo,
    mpPricingMode,
    paymentKind: input.paymentKind,
    manualFormaPago: input.manualFormaPago,
    subtotalProductos,
    descuentoCupon: cupon.descuento,
    costoEnvio,
    totalFinal,
  };

  const dto: CheckoutQuoteResultDto = {
    quoteId,
    expiresAt: expiresAt.toISOString(),
    moneda: 'ARS',
    lineas,
    subtotalProductos,
    descuentoCupon: cupon.descuento,
    costoEnvio,
    totalFinal,
    paymentKind: input.paymentKind,
    ...(mpPricingMode ? { mpPricingMode } : {}),
    ...(input.manualFormaPago ? { manualFormaPago: input.manualFormaPago } : {}),
  };

  return { dto, snapshot, expiresAt, quoteId };
}

export async function persistCheckoutQuote(
  quoteId: string,
  usuarioId: number,
  snapshot: CheckoutQuoteSnapshot,
  expiresAt: Date
): Promise<void> {
  await prisma.checkoutQuote.create({
    data: {
      id: quoteId,
      empresaId: snapshot.empresaId,
      usuarioId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });
}

export async function createCheckoutQuote(
  input: BuildCheckoutQuoteInput,
  usuarioId: number
): Promise<CheckoutQuoteResultDto> {
  const built = await buildCheckoutQuote(input, usuarioId);
  await persistCheckoutQuote(built.quoteId, usuarioId, built.snapshot, built.expiresAt);
  return built.dto;
}

export class CheckoutQuoteError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'EXPIRED' | 'CONSUMED' | 'FORBIDDEN' | 'INVALID'
  ) {
    super(message);
    this.name = 'CheckoutQuoteError';
  }
}

export async function loadCheckoutQuoteForConfirm(
  quoteId: string,
  usuarioId: number
): Promise<CheckoutQuoteSnapshot> {
  const row = await prisma.checkoutQuote.findUnique({ where: { id: quoteId } });
  if (!row) {
    throw new CheckoutQuoteError('Cotización no encontrada', 'NOT_FOUND');
  }
  if (row.usuarioId !== usuarioId) {
    throw new CheckoutQuoteError('Cotización no disponible', 'FORBIDDEN');
  }
  if (row.consumedAt) {
    throw new CheckoutQuoteError('Esta cotización ya fue utilizada', 'CONSUMED');
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new CheckoutQuoteError('La cotización expiró. Volvé a calcular el total.', 'EXPIRED');
  }
  return row.snapshot as unknown as CheckoutQuoteSnapshot;
}

export async function consumeCheckoutQuote(quoteId: string, usuarioId: number): Promise<void> {
  const updated = await prisma.checkoutQuote.updateMany({
    where: {
      id: quoteId,
      usuarioId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (updated.count !== 1) {
    throw new CheckoutQuoteError('No se pudo consumir la cotización', 'INVALID');
  }
}
