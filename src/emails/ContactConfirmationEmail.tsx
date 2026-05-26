import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS, BRAND_DISPLAY_NAME } from '../lib/email-brand';
import type { ContactEmailPayload } from '../types/email.types';
import { BaseLayout } from './BaseLayout';

export type ContactEmailAudience = 'customer' | 'team';

export interface ContactConfirmationEmailProps extends ContactEmailPayload {
  audience: ContactEmailAudience;
  sentAtFormatted: string;
}

export function ContactConfirmationEmail(props: ContactConfirmationEmailProps): React.ReactElement {
  const isTeam = props.audience === 'team';
  const preview = isTeam
    ? `Nueva consulta de ${props.empresa}`
    : `Recibimos tu consulta — ${BRAND_DISPLAY_NAME}`;
  return (
    <BaseLayout previewText={preview}>
      <Section>
        <Heading style={h1}>{isTeam ? 'Nueva consulta' : '¡Gracias por tu consulta!'}</Heading>
        <Text style={text}>
          {isTeam ? (
            <>
              <strong>Fecha:</strong> {props.sentAtFormatted}
              <br />
              <strong>Email:</strong> {props.email}
              <br />
              {props.nombreCompleto ? (
                <>
                  <strong>Nombre:</strong> {props.nombreCompleto}
                  <br />
                </>
              ) : null}
              <strong>Empresa:</strong> {props.empresa}
              <br />
              <strong>Teléfono:</strong> {props.telefono}
            </>
          ) : (
            <>
              Recibimos tu consulta el {props.sentAtFormatted}. Te respondemos a la brevedad (normalmente
              en menos de 24 h hábiles).
            </>
          )}
        </Text>
        <Section style={box}>
          <Text style={boxTitle}>Mensaje</Text>
          <Text style={boxBody}>{props.mensaje}</Text>
        </Section>
        {!isTeam ? (
          <Text style={textMuted}>
            Resumen: <strong>{props.empresa}</strong> · {props.telefono}
          </Text>
        ) : null}
      </Section>
    </BaseLayout>
  );
}

const h1: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 16px',
};

const text: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
};

const textMuted: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '16px 0 0',
};

const box: React.CSSProperties = {
  backgroundColor: BRAND_COLORS.grayBg,
  borderRadius: '8px',
  padding: '16px',
};

const boxTitle: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '13px',
  fontWeight: 700,
  margin: '0 0 8px',
};

const boxBody: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
  whiteSpace: 'pre-wrap',
};
