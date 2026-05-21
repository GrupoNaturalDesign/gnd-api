import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS } from '../lib/email-brand';
import type { OrderEmailPayload } from '../types/email.types';
import { BaseLayout } from './BaseLayout';
import { getOrderStatusUi } from './order-status-ui';

export type OrderStatusEmailProps = OrderEmailPayload;

export function OrderStatusEmail(props: OrderStatusEmailProps): React.ReactElement {
  const ui = getOrderStatusUi(props.status);
  const ref = props.orderId != null ? `Pedido #${props.orderId}` : 'Tu pedido';
  return (
    <BaseLayout previewText={`${ui.title} — ${ref}`}>
      <Section
        style={{
          backgroundColor: ui.bannerBg,
          borderRadius: '8px',
          padding: '20px 16px',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        <Text style={{ color: BRAND_COLORS.white, fontSize: '32px', margin: '0 0 8px' }}>
          {ui.icon}
        </Text>
        <Heading
          style={{
            color: BRAND_COLORS.white,
            fontSize: '22px',
            fontWeight: 700,
            margin: '0 0 8px',
          }}
        >
          {ui.title}
        </Heading>
        <Text style={{ color: BRAND_COLORS.white, fontSize: '15px', lineHeight: '22px', margin: 0 }}>
          {ui.lead}
        </Text>
      </Section>
      <Section>
        <Text style={label}>Cliente</Text>
        <Text style={value}>{props.customerName}</Text>
        <Text style={value}>{props.customerEmail}</Text>
        {props.customerPhone ? <Text style={value}>{props.customerPhone}</Text> : null}
        {props.shippingSummary ? (
          <>
            <Text style={label}>Entrega</Text>
            <Text style={value}>{props.shippingSummary}</Text>
          </>
        ) : null}
        {props.paymentSummary ? (
          <>
            <Text style={label}>Pago</Text>
            <Text style={value}>{props.paymentSummary}</Text>
          </>
        ) : null}
        {props.notes ? (
          <>
            <Text style={label}>Notas</Text>
            <Text style={value}>{props.notes}</Text>
          </>
        ) : null}
        <Text style={label}>Productos</Text>
        {props.items.map((line, i) => (
          <Text key={i} style={itemLine}>
            {line.nombre} × {line.cantidad} — {line.subtotalFormatted}
            {line.especificaciones ? (
              <>
                <br />
                <span style={muted}>{line.especificaciones}</span>
              </>
            ) : null}
            {line.bordado ? (
              <>
                <br />
                <span style={muted}>Bordado: sí</span>
              </>
            ) : null}
          </Text>
        ))}
        <Text style={label}>Totales</Text>
        <Text style={value}>Ítems: {props.itemCount}</Text>
        <Text style={value}>Subtotal: {props.subtotalFormatted}</Text>
        <Text style={value}>IVA: {props.ivaFormatted}</Text>
        <Text style={total}>Total: {props.totalFormatted}</Text>
      </Section>
    </BaseLayout>
  );
}

const label: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  margin: '16px 0 4px',
};

const value: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 4px',
};

const itemLine: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 8px',
  borderLeft: `3px solid ${BRAND_COLORS.red}`,
  paddingLeft: '10px',
};

const muted: React.CSSProperties = {
  color: BRAND_COLORS.grayText,
  fontSize: '13px',
};

const total: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '16px',
  fontWeight: 700,
  margin: '8px 0 0',
};
