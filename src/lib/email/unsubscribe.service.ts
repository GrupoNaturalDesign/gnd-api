import { randomBytes } from 'crypto';
import { prisma } from '../prisma';

const TOKEN_BYTES = 32;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export const unsubscribeService = {
  async createOrGetToken(email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const existing = await prisma.unsubscribeToken.findFirst({ where: { email: normalized } });
    if (existing) return existing.token;

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    await prisma.unsubscribeToken.create({
      data: { email: normalized, token },
    });
    return token;
  },

  /** Desuscripto = suscriptor inactivo en newsletter (no confundir con token del link). */
  async isUnsubscribed(email: string): Promise<boolean> {
    const row = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalizeEmail(email) },
      select: { active: true },
    });
    return row !== null && !row.active;
  },

  async filterUnsubscribed(emails: string[]): Promise<string[]> {
    if (emails.length === 0) return [];

    const uniqueEmails = [...new Set(emails.map(normalizeEmail))];
    const inactive = await prisma.newsletterSubscriber.findMany({
      where: { email: { in: uniqueEmails }, active: false },
      select: { email: true },
    });
    const unsubscribedSet = new Set(inactive.map((r) => r.email.toLowerCase()));
    return uniqueEmails.filter((e) => !unsubscribedSet.has(e));
  },

  async unsubscribe(token: string): Promise<{ success: boolean; message: string }> {
    const record = await prisma.unsubscribeToken.findUnique({ where: { token } });
    if (!record) {
      return { success: false, message: 'Token inválido o ya desuscripto.' };
    }

    await prisma.newsletterSubscriber.updateMany({
      where: { email: record.email },
      data: { active: false },
    });
    await prisma.unsubscribeToken.delete({ where: { id: record.id } });

    return { success: true, message: `El email ${record.email} fue removido de la lista de newsletter.` };
  },
};
