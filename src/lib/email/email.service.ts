import { Prisma } from '@prisma/client';
import { createElement } from 'react';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { prisma } from '../prisma';
import { BRAND_DISPLAY_NAME } from '../email-brand';
import { ContactConfirmationEmail } from '../../emails/ContactConfirmationEmail';
import { InternalOrderNotification } from '../../emails/InternalOrderNotification';
import { NewsletterEmail } from '../../emails/NewsletterEmail';
import { NewsletterWelcomeEmail } from '../../emails/NewsletterWelcomeEmail';
import { OrderStatusEmail } from '../../emails/OrderStatusEmail';
import { getOrderStatusEmailSubject } from '../../emails/order-status-ui';
import { WelcomeEmail } from '../../emails/WelcomeEmail';
import {
  ManualPaymentInstructionsEmail,
  type ManualPaymentInstructionsEmailProps,
} from '../../emails/ManualPaymentInstructionsEmail';
import { unsubscribeService } from './unsubscribe.service';
import { tryGetEmpresaIdFromEnv } from '../checkout-empresa';
import { empresaTiendaConfigService } from '../../services/empresa-tienda-config.service';
import type {
  ContactEmailPayload,
  EmailSendResult,
  NewsletterPayload,
  NewsletterWelcomePayload,
  OrderEmailPayload,
  WelcomeUserPayload,
} from '../../types/email.types';

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function getFromTransactional(): string | undefined {
  return process.env.RESEND_FROM_TRANSACTIONAL;
}

function getFromMarketing(): string | undefined {
  return process.env.RESEND_FROM_MARKETING;
}

function getInternalToEnv(): string | undefined {
  return process.env.RESEND_INTERNAL_TO;
}

async function resolveInternalTo(empresaId?: number): Promise<string | undefined> {
  if (empresaId != null) {
    return (await empresaTiendaConfigService.resolveEmailPedidosInterno(empresaId)) ?? undefined;
  }
  return getInternalToEnv();
}

const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableResendError(error: { statusCode?: number; name?: string; message?: string }): boolean {
  if (!error) return false;
  const code = error.statusCode;
  if (code === undefined) {
    return error.name === 'api_error' || error.name === 'rate_limit_exceeded';
  }
  return code >= 500 || code === 429;
}

async function sendWithRetry<T extends { statusCode?: number; name?: string; message?: string }>(
  sendFn: () => Promise<{ data: unknown; error: T | null }>,
  options: { maxRetries?: number; label?: string } = {}
): Promise<{ data: unknown; error: T | null; attemptCount: number }> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attemptCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attemptCount++;
    const result = await sendFn();

    if (!result.error) {
      return { ...result, attemptCount };
    }

    if (!isRetryableResendError(result.error) || attempt === maxRetries) {
      return { ...result, attemptCount };
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 500;
    if (options.label) {
      console.warn(`[email.service] ${options.label}: intento ${attemptCount} falló (${result.error.name ?? result.error.message}). Reintentando en ${Math.round(delay + jitter)}ms...`);
    }
    await sleep(delay + jitter);
  }

  return { data: null, error: null, attemptCount };
}

/** Resend batch.send puede devolver `[{ id }]` o `{ data: [{ id }] }` según versión del SDK. */
function extractBatchSendIds(data: unknown): { id?: string }[] {
  if (Array.isArray(data)) {
    return data as { id?: string }[];
  }
  if (data && typeof data === 'object' && 'data' in data) {
    const nested = (data as { data: unknown }).data;
    if (Array.isArray(nested)) {
      return nested as { id?: string }[];
    }
  }
  return [];
}

async function logEmail(params: {
  type:
    | 'welcome'
    | 'order_status'
    | 'contact'
    | 'newsletter'
    | 'internal'
    | 'payment_instructions';
  to: string;
  status: 'sent' | 'failed';
  messageId?: string;
  metadata?: Prisma.InputJsonValue;
  error?: string;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        type: params.type,
        to: params.to,
        status: params.status,
        messageId: params.messageId ?? null,
        metadata: params.metadata === undefined ? undefined : params.metadata,
        error: params.error ?? null,
      },
    });
  } catch (e) {
    console.error('[email.service] EmailLog persist failed', e);
  }
}

export const emailService = {
  async sendWelcomeEmail(user: WelcomeUserPayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromTransactional();
    if (!resend || !from) {
      const err = 'Resend no configurado (RESEND_API_KEY / RESEND_FROM_TRANSACTIONAL).';
      await logEmail({
        type: 'welcome',
        to: user.email,
        status: 'failed',
        error: err,
        metadata: { kind: 'welcome' },
      });
      return { success: false, error: err };
    }
    const html = await render(createElement(WelcomeEmail, { name: user.name }));
    const text = await render(createElement(WelcomeEmail, { name: user.name }), { plainText: true });
    const { data, error } = await sendWithRetry(() =>
      resend.emails.send({
        from,
        to: user.email,
        subject: `Bienvenido/a a ${BRAND_DISPLAY_NAME}`,
        html,
        text,
      }),
      { label: 'sendWelcomeEmail' }
    );
    if (error) {
      await logEmail({
        type: 'welcome',
        to: user.email,
        status: 'failed',
        error: error.message,
        metadata: { kind: 'welcome' },
      });
      return { success: false, error: error.message };
    }
    const messageId = data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : undefined;
    await logEmail({
      type: 'welcome',
      to: user.email,
      status: 'sent',
      messageId,
      metadata: { kind: 'welcome' },
    });
    return { success: true, messageId };
  },

  async sendNewsletterWelcomeEmail(payload: NewsletterWelcomePayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromMarketing();
    const baseUrl = process.env.NEWSLETTER_UNSUBSCRIBE_BASE_URL ?? 'https://naturalonline.com.ar';
    const to = payload.email.trim().toLowerCase();

    if (!to) {
      return { success: false, error: 'Email no disponible.' };
    }

    if (!resend || !from) {
      const err = 'Resend marketing no configurado (RESEND_API_KEY / RESEND_FROM_MARKETING).';
      await logEmail({
        type: 'newsletter',
        to,
        status: 'failed',
        error: err,
        metadata: { kind: 'newsletter_welcome' },
      });
      return { success: false, error: err };
    }

    const unsubscribeToken = await unsubscribeService.createOrGetToken(to);
    const emailProps = { unsubscribeToken, unsubscribeBaseUrl: baseUrl };
    const html = await render(createElement(NewsletterWelcomeEmail, emailProps));
    const text = await render(createElement(NewsletterWelcomeEmail, emailProps), { plainText: true });

    const { data, error } = await sendWithRetry(
      () =>
        resend.emails.send({
          from,
          to,
          subject: `¡Gracias por suscribirte al newsletter de ${BRAND_DISPLAY_NAME}!`,
          html,
          text,
        }),
      { label: 'sendNewsletterWelcomeEmail' }
    );

    if (error) {
      await logEmail({
        type: 'newsletter',
        to,
        status: 'failed',
        error: error.message,
        metadata: { kind: 'newsletter_welcome' },
      });
      return { success: false, error: error.message };
    }

    const messageId = data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : undefined;
    await logEmail({
      type: 'newsletter',
      to,
      status: 'sent',
      messageId,
      metadata: { kind: 'newsletter_welcome' },
    });
    return { success: true, messageId };
  },

  async sendManualPaymentInstructionsEmail(
    payload: ManualPaymentInstructionsEmailProps
  ): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromTransactional();
    const to = payload.customerEmail.trim();

    if (!to) {
      return { success: false, error: 'Email del cliente no disponible.' };
    }

    if (!resend || !from) {
      const err = 'Resend no configurado (RESEND_API_KEY / RESEND_FROM_TRANSACTIONAL).';
      await logEmail({
        type: 'payment_instructions',
        to,
        status: 'failed',
        error: err,
        metadata: { orderId: payload.orderId, formaPago: payload.formaPago },
      });
      return { success: false, error: err };
    }

    const subject =
      payload.formaPago === 'transferencia'
        ? `Instrucciones de pago — Pedido #${payload.orderId}`
        : `Tu pedido #${payload.orderId} — Pago en efectivo`;

    const html = await render(createElement(ManualPaymentInstructionsEmail, payload));
    const text = await render(createElement(ManualPaymentInstructionsEmail, payload), {
      plainText: true,
    });

    const { data, error } = await sendWithRetry(
      () =>
        resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
        }),
      { label: 'sendManualPaymentInstructionsEmail' }
    );

    if (error) {
      await logEmail({
        type: 'payment_instructions',
        to,
        status: 'failed',
        error: error.message,
        metadata: { orderId: payload.orderId, formaPago: payload.formaPago },
      });
      return { success: false, error: error.message };
    }

    const messageId =
      data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : undefined;
    await logEmail({
      type: 'payment_instructions',
      to,
      status: 'sent',
      messageId,
      metadata: { orderId: payload.orderId, formaPago: payload.formaPago },
    });
    return { success: true, messageId };
  },

  async sendOrderStatusEmail(order: OrderEmailPayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromTransactional();
    if (!resend || !from) {
      const err = 'Resend no configurado.';
      await logEmail({
        type: 'order_status',
        to: order.customerEmail,
        status: 'failed',
        error: err,
        metadata: { orderId: order.orderId ?? null, status: order.status, source: order.source ?? 'automatic' },
      });
      return { success: false, error: err };
    }
    const orderRef = order.orderId != null ? `#${order.orderId}` : 'Pedido';
    const subject = getOrderStatusEmailSubject(order.status, orderRef, order.statusUiOverrides);
    const html = await render(createElement(OrderStatusEmail, { ...order }));
    const text = await render(createElement(OrderStatusEmail, { ...order }), { plainText: true });
    const { data, error } = await sendWithRetry(
      () =>
        resend.emails.send({
          from,
          to: order.customerEmail,
          subject,
          html,
          text,
        }),
      { label: 'sendOrderStatusEmail' }
    );
    if (error) {
      await logEmail({
        type: 'order_status',
        to: order.customerEmail,
        status: 'failed',
        error: error.message,
        metadata: { orderId: order.orderId ?? null, status: order.status, source: order.source ?? 'automatic' },
      });
      return { success: false, error: error.message };
    }
    const messageId = data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : undefined;
    await logEmail({
      type: 'order_status',
      to: order.customerEmail,
      status: 'sent',
      messageId,
      metadata: { orderId: order.orderId ?? null, status: order.status, source: order.source ?? 'automatic' },
    });
    return { success: true, messageId };
  },

  /**
   * Confirmación de contacto al usuario + copia al equipo de ventas.
   * Ambos envíos son sincrónicos; fallos se registran en `EmailLog`.
   */
  async sendContactConfirmation(data: ContactEmailPayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromTransactional();
    if (!resend || !from) {
      const err = 'Resend no configurado.';
      await logEmail({
        type: 'contact',
        to: data.email,
        status: 'failed',
        error: err,
      });
      return { success: false, error: err };
    }
    const sentAtFormatted = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' });
    const htmlCustomer = await render(
      createElement(ContactConfirmationEmail, {
        ...data,
        audience: 'customer',
        sentAtFormatted,
      })
    );
    const textCustomer = await render(
      createElement(ContactConfirmationEmail, {
        ...data,
        audience: 'customer',
        sentAtFormatted,
      }),
      { plainText: true }
    );
    const { data: sent, error: errCustomer } = await sendWithRetry(
      () =>
        resend.emails.send({
          from,
          to: data.email,
          subject: 'Confirmación — Natural Online (GND)',
          html: htmlCustomer,
          text: textCustomer,
        }),
      { label: 'sendContactConfirmation (customer)' }
    );
    if (errCustomer) {
      await logEmail({
        type: 'contact',
        to: data.email,
        status: 'failed',
        error: errCustomer.message,
      });
      return { success: false, error: errCustomer.message };
    }
    await logEmail({
      type: 'contact',
      to: data.email,
      status: 'sent',
      messageId: sent && typeof sent === 'object' && 'id' in sent ? (sent as { id: string }).id : undefined,
      metadata: { step: 'customer' },
    });

    const internalTo = await resolveInternalTo(tryGetEmpresaIdFromEnv() ?? undefined);
    if (!internalTo) {
      const err = 'Email interno no configurado (admin o RESEND_INTERNAL_TO).';
      await logEmail({
        type: 'internal',
        to: '—',
        status: 'failed',
        error: err,
        metadata: { kind: 'contact_lead' },
      });
      return { success: false, error: err };
    }
    const htmlTeam = await render(
      createElement(ContactConfirmationEmail, {
        ...data,
        audience: 'team',
        sentAtFormatted,
      })
    );
    const textTeam = await render(
      createElement(ContactConfirmationEmail, {
        ...data,
        audience: 'team',
        sentAtFormatted,
      }),
      { plainText: true }
    );
    const { data: sentTeam, error: errTeam } = await sendWithRetry(
      () =>
        resend.emails.send({
          from,
          to: internalTo,
          subject: `Nueva consulta — ${data.empresa}`,
          html: htmlTeam,
          text: textTeam,
        }),
      { label: 'sendContactConfirmation (team)' }
    );
    if (errTeam) {
      await logEmail({
        type: 'internal',
        to: internalTo,
        status: 'failed',
        error: errTeam.message,
        metadata: { kind: 'contact_lead' },
      });
      return { success: false, error: errTeam.message };
    }
    await logEmail({
      type: 'internal',
      to: internalTo,
      status: 'sent',
      messageId: sentTeam && typeof sentTeam === 'object' && 'id' in sentTeam ? (sentTeam as { id: string }).id : undefined,
      metadata: { kind: 'contact_lead' },
    });

    return {
      success: true,
      messageId: sent && typeof sent === 'object' && 'id' in sent ? (sent as { id: string }).id : undefined,
    };
  },

  async sendNewsletter(payload: NewsletterPayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromMarketing();
    const baseUrl = process.env.NEWSLETTER_UNSUBSCRIBE_BASE_URL ?? 'https://naturalonline.com.ar';

    if (!resend || !from) {
      return { success: false, error: 'Resend marketing no configurado (RESEND_FROM_MARKETING).' };
    }
    if (payload.recipientList.length === 0) {
      return { success: false, error: 'Lista de destinatarios vacía.' };
    }

    const filtered = await unsubscribeService.filterUnsubscribed(payload.recipientList);
    const excluded = payload.recipientList.length - filtered.length;

    if (filtered.length === 0) {
      return {
        success: false,
        error: `Todos los ${payload.recipientList.length} destinatarios están desuscriptos.`,
      };
    }

    const tokenMap = new Map<string, string>();
    await Promise.all(
      filtered.map(async (email) => {
        tokenMap.set(email, await unsubscribeService.createOrGetToken(email));
      })
    );

    const BATCH_SIZE = 100;

    const batchPayloads = await Promise.all(
      filtered.map((to) =>
        Promise.all([
          render(
            createElement(NewsletterEmail, {
              subjectLine: payload.subject,
              htmlBody: payload.htmlBody,
              unsubscribeToken: tokenMap.get(to) ?? '',
              unsubscribeBaseUrl: baseUrl,
            })
          ),
          render(
            createElement(NewsletterEmail, {
              subjectLine: payload.subject,
              htmlBody: payload.htmlBody,
              unsubscribeToken: tokenMap.get(to) ?? '',
              unsubscribeBaseUrl: baseUrl,
            }),
            { plainText: true }
          ),
        ]).then(([html, text]) => ({ to, html, text }))
      )
    );

    const chunks: typeof batchPayloads[] = [];
    for (let i = 0; i < batchPayloads.length; i += BATCH_SIZE) {
      chunks.push(batchPayloads.slice(i, i + BATCH_SIZE));
    }

    const idempotencyKey = `newsletter-${Date.now()}`;
    const errors: { to: string; error: string }[] = [];
    const sent: string[] = [];

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      if (!chunk || chunk.length === 0) continue;

      const { data, error } = await sendWithRetry(
        () =>
          resend.batch.send(
            chunk.map((p) => ({
              from,
              to: [p.to],
              subject: payload.subject,
              html: p.html,
              text: p.text,
            })),
            { idempotencyKey: `${idempotencyKey}/chunk-${chunkIdx}` }
          ),
        { label: `sendNewsletter chunk-${chunkIdx}`, maxRetries: 2 }
      );

      if (error) {
        for (const p of chunk) {
          await logEmail({
            type: 'newsletter',
            to: p.to,
            status: 'failed',
            error: error.message,
            metadata: { subject: payload.subject, chunk: chunkIdx },
          });
          errors.push({ to: p.to, error: error.message });
        }
        continue;
      }

      const ids = extractBatchSendIds(data);
      for (let i = 0; i < chunk.length; i++) {
        const row = chunk[i];
        if (!row) continue;
        const id = ids[i]?.id;
        await logEmail({
          type: 'newsletter',
          to: row.to,
          status: 'sent',
          messageId: id,
          metadata: { subject: payload.subject, chunk: chunkIdx, recipientIndex: i },
        });
        if (id) sent.push(id);
      }
    }

    if (sent.length === 0) {
      return { success: false, error: errors[0]?.error ?? 'Error desconocido en newsletter batch.' };
    }

    const warnings: string[] = [];
    if (errors.length > 0) {
      warnings.push(`${errors.length}/${filtered.length} envíos fallidos.`);
    }
    if (excluded > 0) {
      warnings.push(`${excluded} destinatarios desuscriptos, omitidos.`);
    }

    return {
      success: true,
      messageId: sent[0],
      ...(warnings.length > 0 ? { error: warnings.join(' ') } : {}),
    };
  },

  /**
   * Notificación interna de pedido. No lanza: errores solo en log y resultado.
   */
  async sendInternalOrderNotification(order: OrderEmailPayload): Promise<EmailSendResult> {
    const resend = getResend();
    const from = getFromTransactional();
    const internalTo = await resolveInternalTo(order.empresaId);
    if (!resend || !from || !internalTo) {
      await logEmail({
        type: 'internal',
        to: internalTo ?? '—',
        status: 'failed',
        error: 'Falta configuración Resend o email interno de pedidos.',
        metadata: { orderId: order.orderId ?? null },
      });
      return { success: false, error: 'Configuración incompleta.' };
    }
    try {
      const html = await render(createElement(InternalOrderNotification, { ...order }));
      const text = await render(createElement(InternalOrderNotification, { ...order }), { plainText: true });
      const { data, error } = await sendWithRetry(
        () =>
          resend.emails.send({
            from,
            to: internalTo,
            subject:
              order.orderId != null
                ? `Nuevo pedido #${order.orderId} — ${order.customerName}`
                : `Nuevo pedido — ${order.customerName}`,
            html,
            text,
          }),
        { label: 'sendInternalOrderNotification' }
      );
      if (error) {
        await logEmail({
          type: 'internal',
          to: internalTo,
          status: 'failed',
          error: error.message,
          metadata: { orderId: order.orderId ?? null, status: order.status },
        });
        return { success: false, error: error.message };
      }
      const messageId = data && typeof data === 'object' && 'id' in data ? (data as { id: string }).id : undefined;
      await logEmail({
        type: 'internal',
        to: internalTo,
        status: 'sent',
        messageId,
        metadata: { orderId: order.orderId ?? null, status: order.status },
      });
      return { success: true, messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      await logEmail({
        type: 'internal',
        to: internalTo,
        status: 'failed',
        error: msg,
        metadata: { orderId: order.orderId ?? null },
      });
      return { success: false, error: msg };
    }
  },
};

