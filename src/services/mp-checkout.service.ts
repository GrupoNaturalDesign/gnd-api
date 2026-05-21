// src/services/mp-checkout.service.ts
import {
  AdminNotificationSeverity,
  EstadoPedido,
  FormaEnvio,
  FormaPago,
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
  type ProcesarPedidoResult,
} from './pedido-checkout.service';
import { adminNotificationService } from './admin-notification.service';
import {
  validateCheckoutEnvioForMp,
  type CheckoutEnvioClientPayload,
} from './checkout-shipping.service';
import { CuponEngineService } from './cupon-engine.service';
import { empresaConfigService } from './empresa-config.service';
import { sendManualPaymentInstructionsEmailAsync } from './pedido-payment-instructions.service';

const cuponEngine = new CuponEngineService();

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

/** Alinea Checkout Pro con Empresa.cuotasFinanciado (admin /configuracion). */
function buildMercadoPagoPaymentMethods(
  cuotasFinanciado: number
): MercadoPagoCreatePreferenceBody['payment_methods'] | undefined {
  const n = Math.trunc(cuotasFinanciado);
  if (!Number.isFinite(n) || n < 1) return undefined;
  if (n === 1) return { installments: 1 };
  return {
    default_installments: n,
    installments: n,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expectedMercadoPagoTransactionAmount(pedido: {
  total: Prisma.Decimal | string | number;
  descuento: Prisma.Decimal | string | number;
}): number {
  const t = new Prisma.Decimal(pedido.total);
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
}

export interface CrearPedidoMpInput {
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
}

export interface CrearPedidoMpResult {
  pedidoId: number;
  preferenceId: string;
  checkoutUrl: string;
}

export interface CrearPedidoManualInput {
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

function splitNombreApellido(full: string): { name: string; surname: string } {
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

  // --- Cupón: validar y calcular descuento (auditoría) ---
  let cuponDetalle: import('./cupon-engine.service').CuponDetalle | null = null;
  let cuponDescuentoDecimal = new Prisma.Decimal(0);

  if (input.cuponCodigo) {
    const itemsParaValidar = input.items.map((it) => ({
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
      empresaId: input.empresaId,
      codigo: input.cuponCodigo,
      usuarioId,
      items: itemsParaValidar,
      subtotal: subtotalCalc,
    });

    if (result.valido && result.detalle) {
      cuponDetalle = result.detalle;
      cuponDescuentoDecimal = new Prisma.Decimal(result.detalle.descuentoTotal);
    }
  }

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
  const descuento = cuponDescuentoDecimal;

  let costoEnvio = new Prisma.Decimal(0);
  let formaEnvio: FormaEnvio | null = null;
  let checkoutEnvioSnapshot: Prisma.InputJsonValue | undefined;
  let entregaCp: string | null = null;
  let andreaniSucursalId: string | null = null;
  let andreaniSucursalDescripcion: string | null = null;
  let clienteDireccionPersist = input.clienteDireccion?.trim() || null;

  if (input.checkoutEnvio) {
    const v = await validateCheckoutEnvioForMp(input.empresaId, input.checkoutEnvio);
    costoEnvio = v.costoEnvio;
    formaEnvio = v.formaEnvio;
    checkoutEnvioSnapshot = v.snapshot;
    entregaCp = input.checkoutEnvio.cpDestino.trim();
    if (input.checkoutEnvio.deliveryType === 'agency') {
      andreaniSucursalId = input.checkoutEnvio.agencyId?.trim() || null;
      andreaniSucursalDescripcion = input.checkoutEnvio.agencyLabel?.trim() || null;
    }
    const addr = input.checkoutEnvio.address;
    if (addr) {
      const parts = [
        addr.streetName,
        addr.streetNumber,
        addr.floor,
        addr.department,
        addr.city,
        addr.state,
        addr.zipCode,
      ].filter((x) => x != null && String(x).trim() !== '');
      clienteDireccionPersist = parts.join(', ');
    }
  }

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
      observaciones: input.observaciones ?? null,
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
        })),
      },
    },
  });

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

  const preferenceItems: MercadoPagoCreatePreferenceBody['items'] = input.items.map((it) => ({
    id: String(it.productoWebId),
    title: it.nombre.length > 256 ? it.nombre.slice(0, 256) : it.nombre,
    quantity: Math.max(1, Math.floor(it.cantidad)),
    unit_price: Number(it.precioUnitario),
    currency_id: 'ARS',
  }));

  const envioNum = Number(costoEnvio.toString());
  if (envioNum > 0) {
    preferenceItems.push({
      id: 'envio-checkout',
      title: 'Envío',
      quantity: 1,
      unit_price: envioNum,
      currency_id: 'ARS',
    });
  }

  // Si hay cupón, agregar línea de descuento en la preference
  if (cuponDetalle && Number(cuponDetalle.descuentoTotal) > 0) {
    preferenceItems.push({
      id: 'descuento-cupon',
      title: `Descuento: ${cuponDetalle.codigo}`,
      quantity: 1,
      unit_price: -Number(cuponDetalle.descuentoTotal),
      currency_id: 'ARS',
    });
  }

  const precioConfig = await empresaConfigService.getPrecioConfig(input.empresaId);
  const paymentMethods = buildMercadoPagoPaymentMethods(precioConfig.cuotasFinanciado);

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
  };

  const preference = await mercadoPagoClient.createPreference(
    preferenceBody,
    `pref-pedido-${pedido.id}`
  );

  const modo = mercadoPagoConfig.getMode();
  logMpCheckout('mp_preference_created', {
    preferenceId: preference.id,
    pedidoId: pedido.id,
    montoPedido: Number(total),
    descuento: Number(descuento),
    modo,
    items: input.items.length,
    cupon: Boolean(cuponDetalle),
    cuotasFinanciado: precioConfig.cuotasFinanciado,
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
      total: String(total),
    }),
    dedupe: false,
  });

  const checkoutUrl =
    modo === 'production' ? preference.init_point : preference.sandbox_init_point;

  return {
    pedidoId: pedido.id,
    preferenceId: preference.id,
    checkoutUrl,
  };
}

function extractPedidoIdFromExternalReference(ref: string | null | undefined): number | null {
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

  // --- Cupón: validar y calcular descuento ---
  let cuponDetalle: import('./cupon-engine.service').CuponDetalle | null = null;
  let cuponDescuentoDecimal = new Prisma.Decimal(0);

  if (input.cuponCodigo) {
    const itemsParaValidar = input.items.map((it) => ({
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
      empresaId: input.empresaId,
      codigo: input.cuponCodigo,
      usuarioId,
      items: itemsParaValidar,
      subtotal: subtotalCalc,
    });

    if (result.valido && result.detalle) {
      cuponDetalle = result.detalle;
      cuponDescuentoDecimal = new Prisma.Decimal(result.detalle.descuentoTotal);
    }
  }

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
  const descuento = cuponDescuentoDecimal;

  let costoEnvio = new Prisma.Decimal(0);
  let formaEnvio: FormaEnvio | null = null;
  let checkoutEnvioSnapshot: Prisma.InputJsonValue | undefined;

  if (input.checkoutEnvio) {
    const v = await validateCheckoutEnvioForMp(input.empresaId, input.checkoutEnvio);
    costoEnvio = v.costoEnvio;
    formaEnvio = v.formaEnvio;
    checkoutEnvioSnapshot = v.snapshot;
  }

  const total = subtotalPedido.add(costoEnvio);
  const formaPagoValue = input.formaPago === 'efectivo' ? FormaPago.efectivo : FormaPago.transferencia;

  // Armar datos de cupón
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
      clienteDireccion: input.clienteDireccion?.trim() ?? null,
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
        })),
      },
    },
  });

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

  sendManualPaymentInstructionsEmailAsync(pedido.id);

  return {
    pedidoId: pedido.id,
    externalOrderId: `WEB-${pedido.id}`,
    formaPago: input.formaPago,
    redirectPath: `/checkout/instrucciones-pago?pedidoId=${pedido.id}`,
  };
}
