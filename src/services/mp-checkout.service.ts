// src/services/mp-checkout.service.ts
import {
  AdminNotificationSeverity,
  EstadoPedido,
  FormaEnvio,
  FormaPago,
  OrderStatus,
  PedidoSyncStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../lib/prisma';
import { mercadoPagoClient } from './mercadopago/mercadopago.client';
import { mercadoPagoConfig } from './mercadopago/mercadopago.config';
import type {
  MercadoPagoCreatePreferenceBody,
  MercadoPagoPayment,
} from './mercadopago/mercadopago.types';
import {
  computeExpiresAtPedidoManual,
  procesarPedidoConfirmado,
  registrarCotizacionSfactoryParaPedido,
  type ProcesarPedidoResult,
} from './pedido-checkout.service';
import { adminNotificationService } from './admin-notification.service';
import {
  validateCheckoutEnvioForMp,
  type CheckoutEnvioClientPayload,
  type CheckoutShippingItemInput,
} from './checkout-shipping.service';
import { CuponEngineService } from './cupon-engine.service';
import { empresaConfigService } from './empresa-config.service';
import { sendPedidoStatusEmailAsync } from './pedido-email-notification.service';
import { sendManualPaymentInstructionsEmailAsync } from './pedido-payment-instructions.service';
import {
  assertMpPricingMode,
  buildMercadoPagoPaymentMethodsForMode,
  unitPriceMatchesMpMode,
  type MpPricingMode,
} from '../utils/checkout-mp-pricing.util';
import {
  buildClienteDireccionFromAddress,
  normalizeFacturaFields,
  type CheckoutFacturaInput,
  type CheckoutStructuredAddress,
} from '../utils/checkout-address.util';

export type { MpPricingMode };

const cuponEngine = new CuponEngineService();

function resolveClienteDireccionPersist(input: {
  clienteDireccion?: string;
  checkoutEnvio?: CheckoutEnvioClientPayload;
}): string | null {
  const addr = input.checkoutEnvio?.address;
  if (addr) {
    return buildClienteDireccionFromAddress(addr as CheckoutStructuredAddress);
  }
  return input.clienteDireccion?.trim() || null;
}

type CheckoutItemForCupon = {
  productoWebId: number;
  productoPadreId: number;
  cantidad: number;
  precioUnitario: number;
};

async function resolveCuponForPedidoCheckout(
  empresaId: number,
  usuarioId: number,
  cuponCodigo: string | undefined,
  items: CheckoutItemForCupon[]
): Promise<{
  cuponDetalle: import('./cupon-engine.service').CuponDetalle | null;
  cuponDescuentoDecimal: Prisma.Decimal;
}> {
  if (!cuponCodigo?.trim()) {
    return { cuponDetalle: null, cuponDescuentoDecimal: new Prisma.Decimal(0) };
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

  return {
    cuponDetalle: result.detalle,
    cuponDescuentoDecimal: new Prisma.Decimal(result.detalle.descuentoTotal),
  };
}

function pedidoNotificationPayload(pedido: {
  id: number;
  estadoInterno?: EstadoPedido;
  syncStatus?: PedidoSyncStatus | null;
  sfactoryOrdenId?: number | null;
  total?: Prisma.Decimal | string | number;
  clienteNombre?: string | null;
}, extra: Record<string, unknown> = {}) {
  return {
    pedidoId: pedido.id,
    estadoNuevo: pedido.estadoInterno,
    syncStatus: pedido.syncStatus ?? undefined,
    sfactoryOrdenId: pedido.sfactoryOrdenId,
    total: pedido.total != null ? String(pedido.total) : undefined,
    clienteNombre: pedido.clienteNombre ?? undefined,
    ...extra,
  };
}

function logMpCheckout(event: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      ts: new Date().toISOString(),
      ...fields,
    })
  );
}

/** @deprecated Usar buildMercadoPagoPaymentMethodsForMode. */
function buildMercadoPagoPaymentMethods(
  cuotasFinanciado: number
): MercadoPagoCreatePreferenceBody['payment_methods'] | undefined {
  return buildMercadoPagoPaymentMethodsForMode('financiado', cuotasFinanciado);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedMercadoPagoTransactionAmount(pedido: {
  total: Prisma.Decimal | string | number;
  descuento: Prisma.Decimal | string | number;
  sfactoryOrdenId?: number | null;
}): number {
  const t = new Prisma.Decimal(pedido.total);
  // Con PE pre-cotizado, el total ya incluye productos ERP (+ envío) y cupón vía S-Factory.
  if (pedido.sfactoryOrdenId != null) {
    return Number(t.toFixed(2));
  }
  const d = new Prisma.Decimal(pedido.descuento);
  return Number(t.sub(d).toFixed(2));
}

function paymentAmountMatchesPedido(paymentAmount: number, pedido: Parameters<typeof expectedMercadoPagoTransactionAmount>[0]): boolean {
  const exp = expectedMercadoPagoTransactionAmount(pedido);
  return Math.abs(exp - paymentAmount) <= 0.05;
}

async function withMysqlPedidoWebhookLock<T>(pedidoId: number, fn: () => Promise<T>): Promise<T> {
  const lockKey = `gnd_mp_pedido_${pedidoId}`.slice(0, 64);
  const got = await prisma.$queryRaw<Array<{ ok: bigint | number | null }>>(
    Prisma.sql`SELECT GET_LOCK(${lockKey}, 30) AS ok`
  );
  if (Number(got[0]?.ok) !== 1) {
    throw new Error(`No se pudo adquirir lock webhook MP para pedido ${pedidoId}`);
  }
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw(Prisma.sql`SELECT RELEASE_LOCK(${lockKey})`);
  }
}

async function fetchMercadoPagoPaymentWithRetry(paymentId: string): Promise<MercadoPagoPayment | null> {
  const delays = [300, 900, 2500];
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await mercadoPagoClient.getPayment(paymentId);
    } catch {
      const d = delays[i];
      if (d == null) return null;
      await sleep(d);
    }
  }
  return null;
}

async function validateItemPricesForMpMode(
  items: ItemInput[],
  mpPricingMode: MpPricingMode
): Promise<void> {
  const ids = [...new Set(items.map((i) => i.productoWebId))];
  const rows = await prisma.productoPrecio.findMany({
    where: {
      productoWebId: { in: ids },
      tipoCliente: 'minorista',
    },
  });
  const byWebId = new Map(rows.map((r) => [r.productoWebId, r]));

  for (const item of items) {
    const row = byWebId.get(item.productoWebId);
    if (!row) {
      throw new Error(`Precio no encontrado para productoWebId ${item.productoWebId}.`);
    }
    const lista = Number(row.precioLista);
    const transfer = row.precioTransfer != null ? Number(row.precioTransfer) : null;
    if (!unitPriceMatchesMpMode(item.precioUnitario, lista, transfer, mpPricingMode)) {
      throw new Error(
        `Precio unitario inválido para ${item.codigo} (modo ${mpPricingMode}).`
      );
    }
  }
}

// --- Input types (checkout MP) ---

export interface ItemInput {
  productoWebId: number;
  productoPadreId: number;
  sfactoryItemId: number;
  nombre: string;
  codigo: string;
  cantidad: number;
  precioUnitario: number;
  talle?: string;
  color?: string;
  bordado?: boolean;
}

function mapOrderItemsForShippingParcel(items: ItemInput[]): CheckoutShippingItemInput[] {
  return items.map((i) => ({
    productoWebId: i.productoWebId,
    cantidad: i.cantidad,
  }));
}

export interface CrearPedidoMpInput extends CheckoutFacturaInput {
  empresaId: number;
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  items: ItemInput[];
  observaciones?: string;
  /** Cotización validada en servidor + snapshot para futura `createOrder` post-pago. */
  checkoutEnvio?: CheckoutEnvioClientPayload;
  /** Código de cupón opcional — se valida y aplica descuento al pedido. */
  cuponCodigo?: string;
  /** transfer = precio transfer; financiado = precio lista + cuotas MP. */
  mpPricingMode: MpPricingMode;
}

export interface CrearPedidoMpResult {
  pedidoId: number;
  preferenceId: string;
  checkoutUrl: string;
  /** Total productos según S-Factory (`response.total`). */
  subtotalProductos?: number;
  costoEnvio?: number;
  totalCobro?: number;
}

export interface CrearPedidoManualInput extends CheckoutFacturaInput {
  empresaId: number;
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  items: ItemInput[];
  observaciones?: string;
  formaPago: 'efectivo' | 'transferencia';
  checkoutEnvio?: CheckoutEnvioClientPayload;
  entregaCp?: string | null;
  andreaniSucursalId?: string | null;
  andreaniSucursalDescripcion?: string | null;
  /** Código de cupón opcional. */
  cuponCodigo?: string;
}

export interface CrearPedidoManualResult {
  pedidoId: number;
  externalOrderId: string;
  formaPago: 'efectivo' | 'transferencia';
  redirectPath: string;
  subtotalProductos?: number;
  costoEnvio?: number;
  totalCobro?: number;
}

export interface ProcesarWebhookMpResult {
  pedidoId: number | null;
  paymentStatus: string;
  procesado: boolean;
  alreadyProcessed?: boolean;
}

function trimBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export function splitNombreApellido(full: string): { name: string; surname: string } {
  const t = full.trim();
  if (!t) return { name: 'Cliente', surname: 'GND' };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { name: parts[0]!, surname: '-' };
  return { name: parts[0]!, surname: parts.slice(1).join(' ') };
}

/**
 * Crea pedido en BD (pendiente_pago), preferencia MP y persiste mpPreferenceId.
 * Si se envía cuponCodigo, el backend valida el cupón, aplica el descuento y
 * guarda el snapshot en el pedido.
 */
export async function crearPedidoMp(
  input: CrearPedidoMpInput,
  usuarioId: number
): Promise<CrearPedidoMpResult> {
  if (!input.items.length) {
    throw new Error('El pedido debe incluir al menos un ítem');
  }

  const mpPricingMode = assertMpPricingMode(input.mpPricingMode);
  await validateItemPricesForMpMode(input.items, mpPricingMode);

  const { cuponDetalle, cuponDescuentoDecimal } = await resolveCuponForPedidoCheckout(
    input.empresaId,
    usuarioId,
    input.cuponCodigo,
    input.items
  );
  const descuento = cuponDescuentoDecimal;

  let subtotalPedido = new Prisma.Decimal(0);
  const lineas: Array<{
    item: ItemInput;
    subtotal: Prisma.Decimal;
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
  }> = [];

  for (const item of input.items) {
    const cantidad = new Prisma.Decimal(item.cantidad);
    const precioUnitario = new Prisma.Decimal(item.precioUnitario);
    const subtotal = cantidad.mul(precioUnitario);
    subtotalPedido = subtotalPedido.add(subtotal);
    lineas.push({ item, subtotal, cantidad, precioUnitario });
  }

  const iva = new Prisma.Decimal(0);

  let costoEnvio = new Prisma.Decimal(0);
  let formaEnvio: FormaEnvio | null = null;
  let checkoutEnvioSnapshot: Prisma.InputJsonValue | undefined;
  let entregaCp: string | null = null;
  let andreaniSucursalId: string | null = null;
  let andreaniSucursalDescripcion: string | null = null;
  let clienteDireccionPersist = resolveClienteDireccionPersist(input);

  if (input.checkoutEnvio) {
    const v = await validateCheckoutEnvioForMp(
      input.empresaId,
      input.checkoutEnvio,
      mapOrderItemsForShippingParcel(input.items),
      Number(subtotalPedido)
    );
    costoEnvio = v.costoEnvio;
    formaEnvio = v.formaEnvio;
    checkoutEnvioSnapshot = v.snapshot;
    entregaCp = input.checkoutEnvio.cpDestino.trim();
    if (input.checkoutEnvio.deliveryType === 'agency') {
      andreaniSucursalId = input.checkoutEnvio.agencyId?.trim() || null;
      andreaniSucursalDescripcion = input.checkoutEnvio.agencyLabel?.trim() || null;
    }
    if (input.checkoutEnvio.address) {
      clienteDireccionPersist = buildClienteDireccionFromAddress(
        input.checkoutEnvio.address as CheckoutStructuredAddress
      );
    }
  }

  const factura = normalizeFacturaFields(input);

  // Total sin descuento (el descuento está en el campo 'descuento' del pedido)
  const total = subtotalPedido.add(costoEnvio);

  // Armar datos de cupón para persistir en el pedido
  const cuponIdForPedido = cuponDetalle?.cuponId ?? null;
  const cuponCodigoSnapshot = cuponDetalle?.codigo ?? null;
  const cuponDescuentoTotalNum = cuponDetalle ? Number(cuponDetalle.descuentoTotal) : null;
  const cuponDetalleSnapshot = cuponDetalle
    ? (cuponDetalle as unknown as Prisma.InputJsonValue)
    : undefined;

  const pedido = await prisma.pedido.create({
    data: {
      empresaId: input.empresaId,
      usuarioId,
      estadoInterno: EstadoPedido.pendiente_pago,
      clienteNombre: input.clienteNombre,
      clienteEmail: input.clienteEmail,
      clienteTelefono: input.clienteTelefono ?? null,
      clienteDireccion: clienteDireccionPersist,
      subtotal: subtotalPedido,
      descuento,
      iva,
      total,
      costoEnvio,
      formaEnvio: formaEnvio ?? undefined,
      entregaCp: entregaCp ?? undefined,
      andreaniSucursalId: andreaniSucursalId ?? undefined,
      andreaniSucursalDescripcion: andreaniSucursalDescripcion ?? undefined,
      checkoutEnvioSnapshot: checkoutEnvioSnapshot ?? undefined,
      formaPago: FormaPago.mercado_pago,
      mpPricingMode,
      observaciones: input.observaciones ?? null,
      ...factura,
      // --- Campos de cupón ---
      cuponId: cuponIdForPedido,
      cuponCodigoSnapshot,
      cuponDescuentoTotal:
        cuponDescuentoTotalNum != null ? new Prisma.Decimal(cuponDescuentoTotalNum) : undefined,
      cuponDetalleSnapshot,
      // --- fin cupón ---
      expiresAt: new Date(
        Date.now() + mercadoPagoConfig.getCheckoutMpPendingTimeoutMinutes() * 60 * 1000
      ),
      items: {
        create: lineas.map(({ item, subtotal, cantidad, precioUnitario }) => ({
          productoWebId: item.productoWebId,
          productoPadreId: item.productoPadreId,
          sfactoryItemId: item.sfactoryItemId,
          nombre: item.nombre,
          codigo: item.codigo,
          cantidad,
          precioUnitario,
          descuento: new Prisma.Decimal(0),
          subtotal,
          talle: item.talle ?? null,
          color: item.color ?? null,
          bordado: item.bordado ?? false,
        })),
      },
    },
  });

  let cotizacion: Awaited<ReturnType<typeof registrarCotizacionSfactoryParaPedido>>;
  try {
    cotizacion = await registrarCotizacionSfactoryParaPedido(pedido.id);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoInterno: EstadoPedido.fallido,
        sfactoryError: errMsg,
        syncStatus: PedidoSyncStatus.error,
        syncError: errMsg,
      },
    });
    throw new Error(`No se pudo cotizar el pedido en S-Factory: ${errMsg}`);
  }

  const sfactoryTotalProductos = cotizacion.sfactoryTotalProductos;
  const totalCobro = cotizacion.totalACobrar;
  const envioNum = Number(costoEnvio.toString());

  const notificationUrl = mercadoPagoConfig.resolveNotificationUrl();

  const checkoutPublic = trimBaseUrl(process.env.CHECKOUT_PUBLIC_URL ?? '');
  const ngrokBase = trimBaseUrl(process.env.NGROK_URL ?? '');
  const backBase = checkoutPublic
    ? `${checkoutPublic}/checkout/pago-resultado`
    : ngrokBase
      ? `${ngrokBase}/api/checkout/resultado`
      : null;
  if (!backBase) {
    throw new Error(
      'CHECKOUT_PUBLIC_URL o NGROK_URL debe estar configurada para las back_urls del checkout Mercado Pago.'
    );
  }

  const externalReference = `pedido_${pedido.id}`;

  const { name, surname } = splitNombreApellido(input.clienteNombre);

  const preferenceItems: MercadoPagoCreatePreferenceBody['items'] = [
    {
      id: 'productos-sfactory',
      title: 'Productos GND',
      quantity: 1,
      unit_price: sfactoryTotalProductos,
      currency_id: 'ARS',
    },
  ];

  if (envioNum > 0) {
    preferenceItems.push({
      id: 'envio-checkout',
      title: 'Envío',
      quantity: 1,
      unit_price: envioNum,
      currency_id: 'ARS',
    });
  }

  const precioConfig = await empresaConfigService.getPrecioConfig(input.empresaId);
  const paymentMethods = buildMercadoPagoPaymentMethodsForMode(
    mpPricingMode,
    precioConfig.cuotasFinanciado
  );

  const preferenceBody: MercadoPagoCreatePreferenceBody = {
    items: preferenceItems,
    payer: {
      name,
      surname,
      email: input.clienteEmail,
    },
    external_reference: externalReference,
    notification_url: notificationUrl,
    back_urls: {
      success: `${backBase}?mp_return=success`,
      failure: `${backBase}?mp_return=failure`,
      pending: `${backBase}?mp_return=pending`,
    },
    auto_return: 'approved',
    ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
    metadata: { mp_pricing_mode: mpPricingMode },
  };

  const preference = await mercadoPagoClient.createPreference(
    preferenceBody,
    `pref-pedido-${pedido.id}`
  );

  const modo = mercadoPagoConfig.getMode();
  logMpCheckout('mp_preference_created', {
    preferenceId: preference.id,
    pedidoId: pedido.id,
    montoPedido: totalCobro,
    subtotalSfactory: sfactoryTotalProductos,
    costoEnvio: envioNum,
    descuento: Number(descuento),
    modo,
    items: input.items.length,
    cupon: Boolean(cuponDetalle),
    cuotasFinanciado: precioConfig.cuotasFinanciado,
    mpPricingMode,
  });

  await prisma.pedido.update({
    where: { id: pedido.id },
    data: { mpPreferenceId: preference.id },
  });

  await adminNotificationService.notifyPedido({
    empresaId: input.empresaId,
    type: 'pedido.created',
    pedidoId: pedido.id,
    severity: AdminNotificationSeverity.info,
    title: `Pedido #${pedido.id} creado`,
    message: `Pedido Mercado Pago creado para ${input.clienteNombre}.`,
    payload: pedidoNotificationPayload(pedido, {
      estadoAnterior: null,
      estadoNuevo: EstadoPedido.pendiente_pago,
      preferenceId: preference.id,
      total: String(totalCobro),
      subtotalSfactory: sfactoryTotalProductos,
    }),
    dedupe: false,
  });

  sendPedidoStatusEmailAsync(pedido.id, OrderStatus.PENDING, {
    statusUiOverrides: {
      lead: 'Registramos tu pedido. Completá el pago en Mercado Pago para continuar.',
    },
  });

  const checkoutUrl =
    modo === 'production' ? preference.init_point : preference.sandbox_init_point;

  return {
    pedidoId: pedido.id,
    preferenceId: preference.id,
    checkoutUrl,
    subtotalProductos: sfactoryTotalProductos,
    costoEnvio: envioNum,
    totalCobro,
  };
}

export function extractPedidoIdFromExternalReference(ref: string | null | undefined): number | null {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^pedido_(\d+)$/);
  if (!m) return null;
  return parseInt(m[1]!, 10);
}

/**
 * Extrae el id de pago desde body (notificaciones MP) o query (?id=).
 */
export function extractMercadoPagoPaymentId(
  body: unknown,
  query: Record<string, string | undefined>
): string | null {
  const qid = query.id;
  if (typeof qid === 'string' && /^\d+$/.test(qid)) return qid;

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const data = b.data;
    if (data && typeof data === 'object') {
      const id = (data as Record<string, unknown>).id;
      if (id != null && (typeof id === 'string' || typeof id === 'number')) {
        return String(id);
      }
    }
  }

  return null;
}

export function buildWebhookDedupeKey(
  headers: Record<string, string | undefined>,
  body: unknown,
  paymentId: string | null
): string {
  const rid = headers['x-request-id']?.trim();
  if (rid) return `mp:rid:${rid}`;
  let action = '';
  let topic = '';
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.action === 'string') action = b.action;
    if (typeof b.type === 'string') topic = b.type;
  }
  if (paymentId) return `mp:pay:${paymentId}:${topic}:${action}`;
  return `mp:anon:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Procesa notificación de Mercado Pago (webhook).
 */
export async function procesarWebhookMercadoPago(
  body: unknown,
  query: Record<string, string | undefined>
): Promise<ProcesarWebhookMpResult> {
  const paymentId = extractMercadoPagoPaymentId(body, query);
  if (!paymentId) {
    return { pedidoId: null, paymentStatus: 'unknown', procesado: false };
  }

  const payment = await fetchMercadoPagoPaymentWithRetry(paymentId);
  if (!payment) {
    return { pedidoId: null, paymentStatus: 'unknown', procesado: false };
  }

  const statusMp = payment.status;
  const pedidoId = extractPedidoIdFromExternalReference(payment.external_reference);

  if (!pedidoId) {
    return { pedidoId: null, paymentStatus: statusMp, procesado: false };
  }

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) {
    return { pedidoId, paymentStatus: statusMp, procesado: false };
  }

  if (pedido.mpPreferenceId && payment.preference_id) {
    if (String(payment.preference_id) !== String(pedido.mpPreferenceId)) {
      logMpCheckout('mp_webhook_validation_failed', {
        pedidoId,
        paymentId,
        reason: 'preference_mismatch',
      });
      return { pedidoId, paymentStatus: statusMp, procesado: false };
    }
  }

  if (mercadoPagoConfig.isLiveMode()) {
    const expectedCol = mercadoPagoConfig.getExpectedCollectorId();
    if (
      expectedCol != null &&
      payment.collector_id != null &&
      Number(payment.collector_id) !== expectedCol
    ) {
      logMpCheckout('mp_webhook_validation_failed', {
        pedidoId,
        paymentId,
        reason: 'collector_mismatch',
      });
      return { pedidoId, paymentStatus: statusMp, procesado: false };
    }
  }

  if (!paymentAmountMatchesPedido(payment.transaction_amount, pedido)) {
    logMpCheckout('mp_webhook_validation_failed', {
      pedidoId,
      paymentId,
      reason: 'amount_mismatch',
      esperado: expectedMercadoPagoTransactionAmount(pedido),
      recibido: payment.transaction_amount,
    });
    return { pedidoId, paymentStatus: statusMp, procesado: false };
  }

  logMpCheckout('mp_webhook_received', {
    pedidoId,
    paymentId,
    status: statusMp,
    resultado: 'validado',
  });

  if (statusMp !== 'approved') {
    const rejectedStatuses = new Set(['rejected', 'cancelled', 'refunded', 'charged_back']);
    if (rejectedStatuses.has(statusMp) && pedido.estadoInterno === EstadoPedido.pendiente_pago) {
      const message = `Mercado Pago informó estado ${statusMp} para el pago ${paymentId}.`;
      const updated = await prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          estadoInterno: EstadoPedido.fallido,
          mercadoPagoPaymentId: paymentId,
          mercadoPagoStatus: statusMp,
          syncStatus: PedidoSyncStatus.error,
          syncError: message,
        },
      });
      await adminNotificationService.notifyPedido({
        empresaId: pedido.empresaId,
        type: 'pedido.sync_failed',
        pedidoId,
        severity: AdminNotificationSeverity.warning,
        title: `Pago rechazado para pedido #${pedidoId}`,
        message,
        payload: pedidoNotificationPayload(updated, {
          estadoAnterior: pedido.estadoInterno,
          estadoNuevo: updated.estadoInterno,
          mercadoPagoPaymentId: paymentId,
          paymentStatus: statusMp,
        }),
      });
    }

    const pendingStatuses = new Set(['pending', 'in_process', 'authorized']);
    if (pendingStatuses.has(statusMp) && pedido.estadoInterno === EstadoPedido.pendiente_pago) {
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          mercadoPagoPaymentId: paymentId,
          mercadoPagoStatus: statusMp,
        },
      });
    }

    return { pedidoId, paymentStatus: statusMp, procesado: false };
  }

  const terminalOk = new Set<EstadoPedido>([
    EstadoPedido.confirmado,
    EstadoPedido.procesando,
    EstadoPedido.despachado,
    EstadoPedido.entregado,
  ]);
  if (terminalOk.has(pedido.estadoInterno)) {
    return {
      pedidoId,
      paymentStatus: statusMp,
      procesado: true,
      alreadyProcessed: true,
    };
  }

  if (pedido.estadoInterno !== EstadoPedido.pendiente_pago) {
    return { pedidoId, paymentStatus: statusMp, procesado: false };
  }

  let confirmResult: ProcesarPedidoResult = {
    ok: false,
    pedidoId,
    message: 'Sin procesamiento',
  };

  await withMysqlPedidoWebhookLock(pedidoId, async () => {
    const fresh = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    if (!fresh) return;

    if (fresh.estadoInterno !== EstadoPedido.pendiente_pago) {
      if (fresh.mercadoPagoPaymentId === paymentId) {
        confirmResult = await procesarPedidoConfirmado(pedidoId);
      }
      return;
    }

    const claimed = await prisma.pedido.updateMany({
      where: {
        id: pedidoId,
        estadoInterno: EstadoPedido.pendiente_pago,
        mercadoPagoPaymentId: null,
      },
      data: {
        mercadoPagoPaymentId: paymentId,
        mercadoPagoStatus: statusMp,
      },
    });

    const shouldNotifyApproved = claimed.count === 1;

    if (claimed.count === 0) {
      const again = await prisma.pedido.findUnique({ where: { id: pedidoId } });
      if (again?.mercadoPagoPaymentId !== paymentId) return;
    }

    if (shouldNotifyApproved) {
      await adminNotificationService.notifyPedido({
        empresaId: fresh.empresaId,
        type: 'pedido.payment_approved',
        pedidoId,
        severity: AdminNotificationSeverity.success,
        title: `Pago aprobado para pedido #${pedidoId}`,
        message: `Mercado Pago aprobó el pago ${paymentId}.`,
        payload: pedidoNotificationPayload(fresh, {
          estadoAnterior: fresh.estadoInterno,
          mercadoPagoPaymentId: paymentId,
          paymentStatus: statusMp,
        }),
        dedupe: false,
      });
    }

    confirmResult = await procesarPedidoConfirmado(pedidoId);
  });

  logMpCheckout('mp_webhook_received', {
    pedidoId,
    paymentId,
    status: statusMp,
    resultado: confirmResult.ok ? 'confirmado' : 'error_confirmacion',
    alreadyProcessed: confirmResult.alreadyProcessed,
  });

  return {
    pedidoId: confirmResult.pedidoId,
    paymentStatus: statusMp,
    procesado: confirmResult.ok,
    alreadyProcessed: confirmResult.alreadyProcessed,
  };
}

export interface ReconciliarPedidosMpResult {
  cohortA: number;
  cohortB: number;
  confirmados: number;
  errores: number;
  detalles: Array<{ pedidoId: number; ok: boolean; message?: string }>;
}

/**
 * Recupera pedidos MP pagados que quedaron en pendiente_pago (webhook incompleto u omitido).
 * Cohorte A: pago approved ya persistido. Cohorte B: busca pagos approved por external_reference.
 */
export async function reconciliarPedidosMpAtascados(options?: {
  limit?: number;
}): Promise<ReconciliarPedidosMpResult> {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
  const now = new Date();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const cohortAPedidos = await prisma.pedido.findMany({
    where: {
      estadoInterno: EstadoPedido.pendiente_pago,
      formaPago: FormaPago.mercado_pago,
      mercadoPagoStatus: 'approved',
      mercadoPagoPaymentId: { not: null },
    },
    take: limit,
    orderBy: { fechaPedido: 'asc' },
    select: { id: true },
  });

  const cohortBPedidos = await prisma.pedido.findMany({
    where: {
      estadoInterno: EstadoPedido.pendiente_pago,
      formaPago: FormaPago.mercado_pago,
      mercadoPagoPaymentId: null,
      mpPreferenceId: { not: null },
      expiresAt: { gt: now },
      fechaPedido: { gte: since },
    },
    take: limit,
    orderBy: { fechaPedido: 'asc' },
    select: { id: true },
  });

  let confirmados = 0;
  let errores = 0;
  const detalles: ReconciliarPedidosMpResult['detalles'] = [];

  for (const p of cohortAPedidos) {
    try {
      const r = await procesarPedidoConfirmado(p.id);
      if (r.ok) confirmados += 1;
      else errores += 1;
      detalles.push({ pedidoId: p.id, ok: r.ok, message: r.message });
    } catch (e: unknown) {
      errores += 1;
      const msg = e instanceof Error ? e.message : String(e);
      detalles.push({ pedidoId: p.id, ok: false, message: msg });
    }
  }

  for (const p of cohortBPedidos) {
    try {
      const externalRef = `pedido_${p.id}`;
      const payments = await mercadoPagoClient.searchPaymentsByExternalReference(externalRef);
      const approved = payments.find(
        (pay) => pay.status === 'approved' && pay.id != null && String(pay.id).length > 0
      );
      if (!approved?.id) continue;

      const result = await procesarWebhookMercadoPago(
        {
          type: 'payment',
          action: 'reconcile',
          data: { id: String(approved.id) },
        },
        {}
      );
      if (result.procesado) {
        confirmados += 1;
        detalles.push({ pedidoId: p.id, ok: true, message: result.paymentStatus });
      } else if (result.pedidoId != null) {
        errores += 1;
        detalles.push({
          pedidoId: p.id,
          ok: false,
          message: `payment_${result.paymentStatus}`,
        });
      }
    } catch (e: unknown) {
      errores += 1;
      const msg = e instanceof Error ? e.message : String(e);
      detalles.push({ pedidoId: p.id, ok: false, message: msg });
    }
  }

  logMpCheckout('mp_reconcile_run', {
    cohortA: cohortAPedidos.length,
    cohortB: cohortBPedidos.length,
    confirmados,
    errores,
  });

  return {
    cohortA: cohortAPedidos.length,
    cohortB: cohortBPedidos.length,
    confirmados,
    errores,
    detalles,
  };
}

function mpPagoYaAcreditado(pedido: {
  mercadoPagoPaymentId: string | null;
  mercadoPagoStatus: string | null;
}): boolean {
  return (
    pedido.mercadoPagoPaymentId != null &&
    pedido.mercadoPagoPaymentId.length > 0 &&
    pedido.mercadoPagoStatus === 'approved'
  );
}

/**
 * Cancela un checkout MP abandonado (sin pago acreditado). Idempotente si ya está cancelado.
 */
export async function abandonarCheckoutMp(
  usuarioId: number,
  pedidoId: number
): Promise<{ pedidoId: number; estadoInterno: EstadoPedido; alreadyCancelled?: boolean }> {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, usuarioId },
  });
  if (!pedido) {
    throw new Error('Pedido no encontrado');
  }

  if (pedido.estadoInterno === EstadoPedido.cancelado) {
    return { pedidoId, estadoInterno: pedido.estadoInterno, alreadyCancelled: true };
  }

  if (pedido.estadoInterno !== EstadoPedido.pendiente_pago) {
    throw new Error(
      `Solo se puede abandonar un checkout en pendiente de pago (estado actual: ${pedido.estadoInterno}).`
    );
  }

  if (pedido.formaPago !== FormaPago.mercado_pago) {
    throw new Error('Solo aplica a pedidos con Mercado Pago.');
  }

  if (pedido.sfactoryOrdenId != null) {
    throw new Error('El pedido ya tiene una orden en S-Factory y no puede abandonarse desde el checkout.');
  }

  if (mpPagoYaAcreditado(pedido)) {
    throw new Error(
      'El pago ya fue acreditado en Mercado Pago. El pedido se confirmará automáticamente en breve.'
    );
  }

  const nota = '[Checkout abandonado] El cliente salió de Mercado Pago sin completar el pago.';

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.pedido.findUnique({ where: { id: pedidoId } });
    if (!fresh || fresh.estadoInterno === EstadoPedido.cancelado) return;

    if (fresh.stockReservadoWeb) {
      const items = await tx.pedidoItem.findMany({ where: { pedidoId } });
      for (const line of items) {
        if (line.productoWebId == null) continue;
        await tx.productoWeb.update({
          where: { id: line.productoWebId },
          data: { stockCache: { increment: line.cantidad } },
        });
      }
    }

    await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        estadoInterno: EstadoPedido.cancelado,
        syncStatus: PedidoSyncStatus.synced,
        syncError: null,
        stockReservadoWeb: false,
        observaciones: `${fresh.observaciones ?? ''}\n${nota}`.trim(),
      },
    });
  });

  logMpCheckout('mp_checkout_abandoned', { pedidoId, usuarioId });

  return { pedidoId, estadoInterno: EstadoPedido.cancelado };
}

export interface CheckoutMpPaymentStatusDto {
  pedidoId: number;
  estadoInterno: EstadoPedido;
  mercadoPagoPaymentId: string | null;
  mercadoPagoStatus: string | null;
  total: string;
  mpLiveStatus: string | null;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  externalReference: string | null;
  /** Código / referencia para medios offline (p. ej. Rapipago). */
  offlinePaymentReference: string | null;
}

/**
 * Estado de pago MP para polling del checkout (solo el dueño del pedido).
 */
export async function getCheckoutMpPaymentStatus(
  pedidoId: number,
  usuarioId: number
): Promise<CheckoutMpPaymentStatusDto | null> {
  const pedido = await prisma.pedido.findFirst({
    where: {
      id: pedidoId,
      usuarioId,
      formaPago: FormaPago.mercado_pago,
    },
    select: {
      id: true,
      estadoInterno: true,
      mercadoPagoPaymentId: true,
      mercadoPagoStatus: true,
      total: true,
    },
  });
  if (!pedido) return null;

  let mpLiveStatus: string | null = null;
  let paymentMethodId: string | null = null;
  let paymentTypeId: string | null = null;
  let externalReference: string | null = null;
  let offlinePaymentReference: string | null = null;

  if (pedido.mercadoPagoPaymentId) {
    try {
      const pay = await mercadoPagoClient.getPayment(pedido.mercadoPagoPaymentId);
      mpLiveStatus = pay.status;
      paymentMethodId = pay.payment_method_id ?? null;
      paymentTypeId = pay.payment_type_id ?? null;
      externalReference = pay.external_reference ?? null;
      offlinePaymentReference =
        pay.transaction_details?.payment_method_reference_id ?? null;
    } catch {
      mpLiveStatus = pedido.mercadoPagoStatus ?? null;
    }
  }

  return {
    pedidoId: pedido.id,
    estadoInterno: pedido.estadoInterno,
    mercadoPagoPaymentId: pedido.mercadoPagoPaymentId,
    mercadoPagoStatus: pedido.mercadoPagoStatus,
    total: String(pedido.total),
    mpLiveStatus,
    paymentMethodId,
    paymentTypeId,
    externalReference,
    offlinePaymentReference,
  };
}

/**
 * Wrapper retrocompatible: acepta `{ body, query }` y delega a `procesarWebhookMercadoPago`.
 */
export async function procesarWebhookMp(args: {
  body: unknown;
  query: Record<string, string | undefined>;
}): Promise<ProcesarWebhookMpResult> {
  return procesarWebhookMercadoPago(args.body, args.query);
}

/**
 * Crea pedido manual (efectivo / transferencia).
 * Soporta cuponCodigo de la misma forma que crearPedidoMp.
 */
export async function crearPedidoManual(
  input: CrearPedidoManualInput,
  usuarioId: number
): Promise<CrearPedidoManualResult> {
  if (!input.items.length) {
    throw new Error('El pedido debe incluir al menos un ítem');
  }

  const { cuponDetalle, cuponDescuentoDecimal } = await resolveCuponForPedidoCheckout(
    input.empresaId,
    usuarioId,
    input.cuponCodigo,
    input.items
  );
  const descuento = cuponDescuentoDecimal;

  let subtotalPedido = new Prisma.Decimal(0);
  const lineas: Array<{
    item: ItemInput;
    subtotal: Prisma.Decimal;
    cantidad: Prisma.Decimal;
    precioUnitario: Prisma.Decimal;
  }> = [];

  for (const item of input.items) {
    const cantidad = new Prisma.Decimal(item.cantidad);
    const precioUnitario = new Prisma.Decimal(item.precioUnitario);
    const subtotal = cantidad.mul(precioUnitario);
    subtotalPedido = subtotalPedido.add(subtotal);
    lineas.push({ item, subtotal, cantidad, precioUnitario });
  }

  const iva = new Prisma.Decimal(0);

  let costoEnvio = new Prisma.Decimal(0);
  let formaEnvio: FormaEnvio | null = null;
  let checkoutEnvioSnapshot: Prisma.InputJsonValue | undefined;
  let entregaCp: string | null = null;
  let andreaniSucursalId: string | null = null;
  let andreaniSucursalDescripcion: string | null = null;
  let clienteDireccionPersist = resolveClienteDireccionPersist(input);

  if (input.checkoutEnvio) {
    const v = await validateCheckoutEnvioForMp(
      input.empresaId,
      input.checkoutEnvio,
      mapOrderItemsForShippingParcel(input.items),
      Number(subtotalPedido)
    );
    costoEnvio = v.costoEnvio;
    formaEnvio = v.formaEnvio;
    checkoutEnvioSnapshot = v.snapshot;
    entregaCp = input.checkoutEnvio.cpDestino.trim();
    if (input.checkoutEnvio.deliveryType === 'agency') {
      andreaniSucursalId = input.checkoutEnvio.agencyId?.trim() || null;
      andreaniSucursalDescripcion = input.checkoutEnvio.agencyLabel?.trim() || null;
    }
    if (input.checkoutEnvio.address) {
      clienteDireccionPersist = buildClienteDireccionFromAddress(
        input.checkoutEnvio.address as CheckoutStructuredAddress
      );
    }
  }

  const factura = normalizeFacturaFields(input);

  const total = subtotalPedido.add(costoEnvio);
  const formaPagoValue = input.formaPago === 'efectivo' ? FormaPago.efectivo : FormaPago.transferencia;

  const cuponIdForPedido = cuponDetalle?.cuponId ?? null;
  const cuponCodigoSnapshot = cuponDetalle?.codigo ?? null;
  const cuponDescuentoTotalVal = cuponDetalle ? Number(cuponDetalle.descuentoTotal) : null;
  const cuponDetalleSnapshot = cuponDetalle
    ? (cuponDetalle as unknown as Prisma.InputJsonValue)
    : undefined;

  const pedido = await prisma.pedido.create({
    data: {
      empresaId: input.empresaId,
      usuarioId,
      estadoInterno: EstadoPedido.pendiente_confirmacion,
      syncStatus: PedidoSyncStatus.pending,
      clienteNombre: input.clienteNombre,
      clienteEmail: input.clienteEmail,
      clienteTelefono: input.clienteTelefono ?? null,
      clienteDireccion: clienteDireccionPersist,
      subtotal: subtotalPedido,
      descuento,
      iva,
      total,
      costoEnvio,
      formaEnvio: formaEnvio ?? undefined,
      entregaCp: input.entregaCp ?? undefined,
      andreaniSucursalId: input.andreaniSucursalId ?? undefined,
      andreaniSucursalDescripcion: input.andreaniSucursalDescripcion ?? undefined,
      checkoutEnvioSnapshot: checkoutEnvioSnapshot ?? undefined,
      formaPago: formaPagoValue,
      observaciones: input.observaciones ?? null,
      ...factura,
      expiresAt: computeExpiresAtPedidoManual(),
      // --- Campos de cupón ---
      cuponId: cuponIdForPedido,
      cuponCodigoSnapshot,
      cuponDescuentoTotal:
        cuponDescuentoTotalVal != null ? new Prisma.Decimal(cuponDescuentoTotalVal) : undefined,
      cuponDetalleSnapshot,
      // --- fin cupón ---
      items: {
        create: lineas.map(({ item, subtotal, cantidad, precioUnitario }) => ({
          productoWebId: item.productoWebId,
          productoPadreId: item.productoPadreId,
          sfactoryItemId: item.sfactoryItemId,
          nombre: item.nombre,
          codigo: item.codigo,
          cantidad,
          precioUnitario,
          descuento: new Prisma.Decimal(0),
          subtotal,
          talle: item.talle ?? null,
          color: item.color ?? null,
          bordado: item.bordado ?? false,
        })),
      },
    },
  });

  let cotizacion: Awaited<ReturnType<typeof registrarCotizacionSfactoryParaPedido>>;
  try {
    cotizacion = await registrarCotizacionSfactoryParaPedido(pedido.id);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoInterno: EstadoPedido.fallido,
        sfactoryError: errMsg,
        syncStatus: PedidoSyncStatus.error,
        syncError: errMsg,
      },
    });
    throw new Error(`No se pudo cotizar el pedido en S-Factory: ${errMsg}`);
  }

  await adminNotificationService.notifyPedido({
    empresaId: input.empresaId,
    type: 'pedido.confirmation_required',
    pedidoId: pedido.id,
    severity: AdminNotificationSeverity.warning,
    title: `Pedido #${pedido.id} pendiente de confirmación`,
    message: `Pedido manual creado para ${input.clienteNombre}. Requiere aprobación administrativa.`,
    payload: pedidoNotificationPayload(pedido, {
      estadoAnterior: null,
      estadoNuevo: EstadoPedido.pendiente_confirmacion,
      formaPago: formaPagoValue,
    }),
    dedupe: false,
  });

  sendPedidoStatusEmailAsync(pedido.id, OrderStatus.PENDING, {
    statusUiOverrides: {
      lead:
        'Registramos tu pedido. Te enviaremos por email las instrucciones de pago en breve.',
    },
  });
  sendManualPaymentInstructionsEmailAsync(pedido.id);

  return {
    pedidoId: pedido.id,
    externalOrderId: `WEB-${pedido.id}`,
    formaPago: input.formaPago,
    redirectPath: `/checkout/instrucciones-pago?pedidoId=${pedido.id}`,
    subtotalProductos: cotizacion.sfactoryTotalProductos,
    costoEnvio: Number(costoEnvio.toString()),
    totalCobro: cotizacion.totalACobrar,
  };
}
