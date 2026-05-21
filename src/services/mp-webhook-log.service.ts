import prisma from '../lib/prisma';

export type MpWebhookLogOutcome =
  | 'processed'
  | 'duplicate'
  | 'error'
  | 'skipped'
  | 'invalid_signature'
  | 'validation_failed';

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
