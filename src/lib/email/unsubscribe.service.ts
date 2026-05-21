import { randomBytes } from 'crypto';
import { prisma } from '../prisma';

const TOKEN_BYTES = 32;

export const unsubscribeService = {
  async createOrGetToken(email: string): Promise<string> {
    const normalized = email.toLowerCase();
    const existing = await prisma.unsubscribeToken.findFirst({ where: { email: normalized } });
    if (existing) return existing.token;

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    await prisma.unsubscribeToken.create({
      data: { email: normalized, token },
    });
    return token;
  },

  async isUnsubscribed(email: string): Promise<boolean> {
    const record = await prisma.unsubscribeToken.findFirst({
      where: { email: email.toLowerCase() },
    });
    return record !== null;
  },

  async filterUnsubscribed(emails: string[]): Promise<string[]> {
    if (emails.length === 0) return [];

    const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase()))];
    const tokens = await prisma.unsubscribeToken.findMany({
      where: { email: { in: uniqueEmails } },
      select: { email: true },
    });
    const unsubscribedSet = new Set(tokens.map((t) => t.email.toLowerCase()));
    return uniqueEmails.filter((e) => !unsubscribedSet.has(e.toLowerCase()));
  },

  async unsubscribe(token: string): Promise<{ success: boolean; message: string }> {
    const record = await prisma.unsubscribeToken.findUnique({ where: { token } });
    if (!record) {
      return { success: false, message: 'Token inválido o ya desuscripto.' };
    }
    await prisma.unsubscribeToken.delete({ where: { id: record.id } });
    return { success: true, message: `El email ${record.email} fue removido de la lista de newsletter.` };
  },
};