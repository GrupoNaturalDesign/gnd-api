/** Tope por campaña (plan Resend gratis: 100 emails/día). Configurable vía env. */
export function getNewsletterMaxRecipients(): number {
  const parsed = parseInt(process.env.NEWSLETTER_MAX_RECIPIENTS ?? '100', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(parsed, 500);
}
