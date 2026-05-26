import { Heading, Link, Section } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS, BRAND_DISPLAY_NAME } from '../lib/email-brand';
import { BaseLayout } from './BaseLayout';

export interface NewsletterEmailProps {
  subjectLine: string;
  /** HTML del cuerpo (origen admin de confianza). */
  htmlBody: string;
  /** Token de desuscripción (generado por unsubscribeService). */
  unsubscribeToken: string;
  /** URL base del frontend (sin barra final). */
  unsubscribeBaseUrl: string;
}

export function NewsletterEmail({
  subjectLine,
  htmlBody,
  unsubscribeToken,
  unsubscribeBaseUrl,
}: NewsletterEmailProps): React.ReactElement {
  const unsubscribeUrl = `${unsubscribeBaseUrl.replace(/\/$/, '')}/unsubscribe?token=${unsubscribeToken}`;
  return (
    <BaseLayout previewText={subjectLine}>
      <Section>
        <Heading style={h1}>{subjectLine}</Heading>
        <div
          // eslint-disable-next-line react/no-danger -- contenido HTML desde panel admin
          dangerouslySetInnerHTML={{ __html: htmlBody }}
          style={htmlZone}
        />
        <Section style={{ marginTop: '24px' }}>
          <span style={finePrint}>
            Recibís este mensaje por estar en nuestra lista de contacto. {BRAND_DISPLAY_NAME} · Córdoba,
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
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 20px',
};

const htmlZone: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '15px',
  lineHeight: '24px',
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
