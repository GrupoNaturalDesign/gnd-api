/** Colores de marca (emails). */
export const BRAND_COLORS = {
  black: '#000000',
  red: '#ED3237',
  white: '#FFFFFF',
  grayBg: '#F5F5F5',
  grayText: '#666666',
} as const;

export const BRAND_FOOTER = {
  address: 'Rivera Indarte 2143, Córdoba',
  email: 'consultas@naturalonline.com.ar',
  /** Texto visible para WhatsApp */
  whatsappLabel: '+54 9 351 713-6311',
  /** Solo dígitos para wa.me (configurable por env). */
  whatsappDigits: '5493517136311',
} as const;

export function getBrandLogoUrl(): string {
  return process.env.BRAND_LOGO_URL ?? 'https://naturalonline.com.ar/logos/logo-2.svg';
}

export function getWhatsAppHref(): string {
  const digits = process.env.BRAND_WHATSAPP_DIGITS ?? BRAND_FOOTER.whatsappDigits;
  return `https://wa.me/${digits}`;
}
