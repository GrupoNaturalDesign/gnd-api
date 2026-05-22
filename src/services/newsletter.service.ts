import prisma from '../lib/prisma';
import { emailService } from '../lib/email/email.service';

export interface SubscribeResult {
  success: boolean;
  message: string;
  email?: string;
}

export interface SubscribersResult {
  data: { id: string; email: string; subscribedAt: Date; active: boolean }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmailLogsResult {
  data: {
    id: string;
    type: string;
    to: string;
    status: string;
    messageId: string | null;
    createdAt: Date;
  }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function sendWelcomeEmailAsync(email: string): void {
  void emailService.sendNewsletterWelcomeEmail({ email }).catch((err) => {
    console.error('[newsletter.service] welcome email failed', err);
  });
}

export const newsletterService = {
  async subscribe(email: string): Promise<SubscribeResult> {
    const normalized = email.toLowerCase().trim();

    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
    });

    if (existing) {
      if (existing.active) {
        return { success: true, message: 'Ya estás suscripto a nuestro newsletter.', email: normalized };
      }
      await prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { active: true, subscribedAt: new Date() },
      });
      sendWelcomeEmailAsync(normalized);
      return { success: true, message: 'Tu suscripción fue reactivada.', email: normalized };
    }

    await prisma.newsletterSubscriber.create({
      data: { email: normalized },
    });
    sendWelcomeEmailAsync(normalized);
    return { success: true, message: 'Te suscribiste exitosamente al newsletter.', email: normalized };
  },

  async getActiveSubscribers(page = 1, limit = 20): Promise<SubscribersResult> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.newsletterSubscriber.findMany({
        where: { active: true },
        orderBy: { subscribedAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, email: true, subscribedAt: true, active: true },
      }),
      prisma.newsletterSubscriber.count({ where: { active: true } }),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async deactivate(email: string): Promise<void> {
    await prisma.newsletterSubscriber.updateMany({
      where: { email: email.toLowerCase().trim() },
      data: { active: false },
    });
  },

  async getActiveEmails(): Promise<string[]> {
    const rows = await prisma.newsletterSubscriber.findMany({
      where: { active: true },
      select: { email: true },
    });
    return rows.map((r: { email: string }) => r.email);
  },

  async getEmailLogs(params: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    from?: Date;
    to?: Date;
  }): Promise<EmailLogsResult> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: {
      type?: string;
      status?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = params.from;
      if (params.to) where.createdAt.lte = params.to;
    }

    const [data, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, type: true, to: true, status: true, messageId: true, createdAt: true },
      }),
      prisma.emailLog.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
};