import { Heading, Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS } from '../lib/email-brand';
import { BaseLayout } from './BaseLayout';

export interface NewsletterWelcomeEmailProps {
  unsubscribeToken: string;
  unsubscribeBaseUrl: string;
}

export function NewsletterWelcomeEmail({
  unsubscribeToken,
  unsubscribeBaseUrl,
}: NewsletterWelcomeEmailProps): React.ReactElement {
  const unsubscribeUrl = `${unsubscribeBaseUrl.replace(/\/$/, '')}/unsubscribe?token=${unsubscribeToken}`;

  return (
    <BaseLayout previewText="Gracias por suscribirte al newsletter de GND Natural Design">
      <Section>
        <Heading style={h1}>¡Gracias por suscribirte!</Heading>
        <Text style={text}>
          A partir de ahora vas a recibir novedades, lanzamientos y ofertas exclusivas de GND Natural
          Design.
        </Text>
        <Text style={text}>
          Si en algún momento preferís dejar de recibir estos mensajes, podés desuscribirte con un clic.
        </Text>
        <Section style={{ marginTop: '24px' }}>
          <span style={finePrint}>
            Recibís este mensaje por suscribirte a nuestro newsletter. GND Natural Design · Córdoba,
            Argentina.{' '}
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Desuscribirse
            </Link>
          </span>
        </Section>
      </Section>
    </BaseLayout>
  );
}

const h1: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 16px',
};

const text: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 12px',
};

const finePrint: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '11px',
  lineHeight: '16px',
};

const unsubscribeLink: React.CSSProperties = {
  color: BRAND_COLORS.red,
  textDecoration: 'underline',
};
