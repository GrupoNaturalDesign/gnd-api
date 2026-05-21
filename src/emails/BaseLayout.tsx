import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS, BRAND_FOOTER, getBrandLogoUrl, getWhatsAppHref } from '../lib/email-brand';

export interface BaseLayoutProps {
  previewText: string;
  children: React.ReactNode;
}

export function BaseLayout({ previewText, children }: BaseLayoutProps): React.ReactElement {
  const logoUrl = getBrandLogoUrl();
  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img src={logoUrl} width={160} height="auto" alt="GND Natural Design" style={logo} />
          </Section>
          {children}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>{BRAND_FOOTER.address}</Text>
            <Text style={footerText}>
              <Link href={`mailto:${BRAND_FOOTER.email}`} style={link}>
                {BRAND_FOOTER.email}
              </Link>
            </Text>
            <Text style={footerText}>
              WhatsApp:{' '}
              <Link href={getWhatsAppHref()} style={link}>
                {BRAND_FOOTER.whatsappLabel}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: BRAND_COLORS.white,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '24px 16px 48px',
  maxWidth: '580px',
};

const header: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '24px',
};

const logo: React.CSSProperties = {
  margin: '0 auto',
};

const hr: React.CSSProperties = {
  borderColor: '#E5E5E5',
  margin: '32px 0',
};

const footer: React.CSSProperties = {
  textAlign: 'center',
};

const footerText: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '12px',
  lineHeight: '20px',
  margin: '4px 0',
};

const link: React.CSSProperties = {
  color: BRAND_COLORS.red,
  textDecoration: 'underline',
};
