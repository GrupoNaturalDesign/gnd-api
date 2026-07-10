import { Heading, Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS } from '../lib/email-brand';
import { BaseLayout } from './BaseLayout';

export interface OrderExpiringSoonEmailProps {
  customerName: string;
  orderId: number;
  externalOrderId: string;
  totalFormatted: string;
  expiresAtFormatted: string;
  formaPago: 'mercado_pago' | 'transferencia' | 'efectivo';
  instructionsUrl?: string;
}

function paymentReminder(props: OrderExpiringSoonEmailProps): string {
  if (props.formaPago === 'mercado_pago') {
    return 'Completá el pago en Mercado Pago desde tu cuenta o la app antes de la fecha límite. Si ya pagaste, podés ignorar este mensaje.';
  }
  if (props.formaPago === 'transferencia') {
    return 'Realizá la transferencia y enviá el comprobante antes de la fecha límite para que confirmemos tu pedido.';
  }
  return 'Coordiná el pago en efectivo y enviá el comprobante antes de la fecha límite para que confirmemos tu pedido.';
}

export function OrderExpiringSoonEmail(props: OrderExpiringSoonEmailProps): React.ReactElement {
  const preview = `Tu pedido #${props.orderId} vence pronto`;

  return (
    <BaseLayout previewText={preview}>
      <Section>
        <Heading style={h1}>Tu pedido vence pronto</Heading>
        <Text style={text}>Hola {props.customerName},</Text>
        <Text style={text}>
          Tu pedido <strong>{props.externalOrderId}</strong> por <strong>{props.totalFormatted}</strong>{' '}
          sigue pendiente de pago y vence el <strong>{props.expiresAtFormatted}</strong>.
        </Text>
        <Text style={text}>{paymentReminder(props)}</Text>
        {props.instructionsUrl ? (
          <Text style={text}>
            <Link href={props.instructionsUrl} style={ctaLink}>
              Ver instrucciones de pago
            </Link>
          </Text>
        ) : null}
        <Text style={finePrint}>
          Si no completás el pago a tiempo, el pedido se cancelará automáticamente y el stock quedará
          disponible nuevamente.
        </Text>
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

const ctaLink: React.CSSProperties = {
  color: BRAND_COLORS.red,
  fontWeight: 600,
  textDecoration: 'underline',
};

const finePrint: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
};
