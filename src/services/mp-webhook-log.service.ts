import prisma from '../lib/prisma';
import {
  procesarWebhookMercadoPago,
  type ProcesarWebhookMpResult,
} from './mp-checkout.service';

export type MpWebhookLogOutcome =
  | 'processed'
  | 'duplicate'
  | 'error'
  | 'skipped'
  | 'invalid_signature'
  | 'validation_failed';

export interface HandleMercadoPagoWebhookInput {
  dedupeKey: string;
  body: unknown;
  query: Record<string, string | undefined>;
  paymentId: string | null;
}

export interface HandleMercadoPagoWebhookResult {
  httpStatus: number;
  body: {
    success: boolean;
    message: string;
    pedidoId?: number | null;
    paymentStatus?: string;
    procesado?: boolean;
  };
  result?: ProcesarWebhookMpResult;
}

/**
 * Intenta registrar una notificación por clave única. Si ya existía, devuelve duplicate.
 */
export async function tryBeginMpWebhook(
  dedupeKey: string,
  paymentId: string | null,
  pedidoId: number | null
): Promise<'inserted' | 'duplicate'> {
  try {
    await prisma.mpWebhookLog.create({
      data: {
        dedupeKey,
        paymentId,
        pedidoId,
        outcome: 'skipped',
        detail: 'received',
      },
    });
    return 'inserted';
  } catch (e: unknown) {
    const code =
      typeof e === 'object' && e !== null && 'code' in e ? (e as { code?: string }).code : undefined;
    if (code === 'P2002') return 'duplicate';
    throw e;
  }
}

export async function findMpWebhookLogByDedupeKey(dedupeKey: string) {
  return prisma.mpWebhookLog.findUnique({ where: { dedupeKey } });
}

export async function finishMpWebhookLog(
  dedupeKey: string,
  patch: {
    outcome: MpWebhookLogOutcome;
    mpStatus?: string | null;
    detail?: string | null;
    pedidoId?: number | null;
    paymentId?: string | null;
  }
): Promise<void> {
  await prisma.mpWebhookLog.update({
    where: { dedupeKey },
    data: {
      outcome: patch.outcome,
      mpStatus: patch.mpStatus ?? undefined,
      detail: patch.detail ?? undefined,
      pedidoId: patch.pedidoId === undefined ? undefined : patch.pedidoId,
      paymentId: patch.paymentId === undefined ? undefined : patch.paymentId,
    },
  });
}

export function mapWebhookResultToLogPatch(
  result: ProcesarWebhookMpResult,
  isDuplicate: boolean
): {
  outcome: MpWebhookLogOutcome;
  mpStatus: string;
  pedidoId: number | null;
  detail?: string;
} {
  if (result.procesado) {
    return {
      outcome: isDuplicate ? 'duplicate' : 'processed',
      mpStatus: result.paymentStatus,
      pedidoId: result.pedidoId,
      detail: result.alreadyProcessed ? 'already_processed' : undefined,
    };
  }

  if (result.pedidoId == null && result.paymentStatus === 'unknown') {
    return {
      outcome: 'skipped',
      mpStatus: result.paymentStatus,
      pedidoId: null,
      detail: 'payment_not_found',
    };
  }

  if (result.pedidoId != null && result.paymentStatus === 'approved') {
    return {
      outcome: 'validation_failed',
      mpStatus: result.paymentStatus,
      pedidoId: result.pedidoId,
      detail: 'confirm_not_completed',
    };
  }

  return {
    outcome: isDuplicate ? 'duplicate' : 'skipped',
    mpStatus: result.paymentStatus,
    pedidoId: result.pedidoId,
    detail: result.alreadyProcessed ? 'already_processed' : undefined,
  };
}

export function shouldReturn500ForWebhookResult(result: ProcesarWebhookMpResult): boolean {
  return result.paymentStatus === 'unknown';
}

export function buildWebhookResponseMessage(
  result: ProcesarWebhookMpResult,
  isDuplicate: boolean,
  staleRepaired: boolean
): string {
  if (result.procesado) {
    if (staleRepaired) return 'duplicate_reprocessed';
    if (result.alreadyProcessed) return isDuplicate ? 'duplicate_already_processed' : 'already_processed';
    return isDuplicate ? 'duplicate_processed' : 'processed';
  }
  if (staleRepaired) return 'duplicate_reprocessed';
  if (isDuplicate) return 'duplicate';
  if (result.paymentStatus === 'unknown') return 'payment_not_found';
  return 'skipped';
}

/**
 * Orquesta deduplicación, procesamiento síncrono del webhook y persistencia del log.
 * Debe completarse antes de responder a Mercado Pago.
 */
export async function handleMercadoPagoWebhookNotification(
  input: HandleMercadoPagoWebhookInput
): Promise<HandleMercadoPagoWebhookResult> {
  const { dedupeKey, body, query, paymentId } = input;

  const begin = await tryBeginMpWebhook(dedupeKey, paymentId, null);
  const isDuplicate = begin === 'duplicate';

  let staleRepaired = false;
  if (isDuplicate) {
    const existing = await findMpWebhookLogByDedupeKey(dedupeKey);
    staleRepaired = existing?.detail === 'received';
  }

  try {
    const result = await procesarWebhookMercadoPago(body, query);
    const logPatch = mapWebhookResultToLogPatch(result, isDuplicate && !staleRepaired);

    await finishMpWebhookLog(dedupeKey, {
      ...logPatch,
      paymentId,
      detail:
        staleRepaired && result.procesado
          ? 'stale_received_repaired'
          : logPatch.detail,
    });

    const httpStatus = shouldReturn500ForWebhookResult(result) ? 500 : 200;
    const message = buildWebhookResponseMessage(result, isDuplicate, staleRepaired);

    return {
      httpStatus,
      body: {
        success: httpStatus === 200,
        message,
        pedidoId: result.pedidoId,
        paymentStatus: result.paymentStatus,
        procesado: result.procesado,
      },
      result,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WebhookMP] Error procesando:', msg);

    try {
      await finishMpWebhookLog(dedupeKey, {
        outcome: 'error',
        paymentId,
        detail: msg,
      });
    } catch (e2) {
      console.error('[WebhookMP] Error actualizando log:', e2);
    }

    return {
      httpStatus: 500,
      body: {
        success: false,
        message: msg,
      },
    };
  }
}
