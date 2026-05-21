import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS } from '../lib/email-brand';
import { BaseLayout } from './BaseLayout';

export interface WelcomeEmailProps {
  name: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps): React.ReactElement {
  return (
    <BaseLayout previewText={`Hola ${name}, bienvenido/a a GND Natural Design`}>
      <Section>
        <Heading style={h1}>¡Bienvenido/a!</Heading>
        <Text style={text}>Hola {name},</Text>
        <Text style={text}>
          Gracias por completar tu registro en GND Natural Design. Ya podés explorar el catálogo y
          realizar tus pedidos.
        </Text>
        <Text style={text}>Si necesitás ayuda, respondé a este correo o escribinos por WhatsApp.</Text>
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
