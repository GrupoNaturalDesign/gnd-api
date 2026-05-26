import { Heading, Section, Text } from '@react-email/components';
import * as React from 'react';
import { BRAND_COLORS } from '../lib/email-brand';
import type { OrderEmailPayload } from '../types/email.types';
import { BaseLayout } from './BaseLayout';

export type InternalOrderNotificationProps = OrderEmailPayload;

/** Notificación al equipo: mismo detalle que el cliente, tono operativo. */
export function InternalOrderNotification(props: InternalOrderNotificationProps): React.ReactElement {
  const ref =
    props.orderId != null ? `Pedido interno #${props.orderId}` : 'Pedido web (sin ID en sistema)';
  return (
    <BaseLayout previewText={`Nuevo pedido — ${ref}`}>
      <Section>
        <Heading style={h1}>Nuevo pedido</Heading>
        <Text style={text}>
          <strong>Cliente:</strong> {props.customerName}
          <br />
          <strong>Email:</strong> {props.customerEmail}
          <br />
          {props.customerPhone ? (
            <>
              <strong>Teléfono:</strong> {props.customerPhone}
              <br />
            </>
          ) : null}
          <strong>Estado comunicado:</strong> {props.status}
        </Text>
        {props.shippingSummary ? (
          <Text style={text}>
            <strong>Entrega:</strong> {props.shippingSummary}
          </Text>
        ) : null}
        {props.paymentSummary ? (
          <Text style={text}>
            <strong>Pago:</strong> {props.paymentSummary}
          </Text>
        ) : null}
        {props.notes ? (
          <Text style={text}>
            <strong>Notas:</strong> {props.notes}
          </Text>
        ) : null}
        <Text style={sub}>Ítems</Text>
        {props.items.map((line, i) => (
          <Text key={i} style={item}>
            • {line.nombre} × {line.cantidad} — {line.subtotalFormatted}
          </Text>
        ))}
        <Text style={text}>
          <strong>Total ítems:</strong> {props.itemCount}
          <br />
          <strong>Subtotal:</strong> {props.subtotalFormatted}
          {props.shippingCostFormatted ? (
            <>
              {' '}
              · <strong>Envío:</strong> {props.shippingCostFormatted}
            </>
          ) : null}{' '}
          · <strong>Total:</strong> {props.totalFormatted}
        </Text>
      </Section>
    </BaseLayout>
  );
}

const h1: React.CSSProperties = {
  color: BRAND_COLORS.red,
  fontSize: '22px',
  fontWeight: 700,
  margin: '0 0 16px',
};

const text: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
};

const sub: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '13px',
  fontWeight: 700,
  margin: '16px 0 8px',
};

const item: React.CSSProperties = {
  color: BRAND_COLORS.black,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 4px',
};
