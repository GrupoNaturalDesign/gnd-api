import { Heading, Hr, Section, Text } from '@react-email/components';

import * as React from 'react';

import { BRAND_COLORS } from '../lib/email-brand';

import { BaseLayout } from './BaseLayout';

import type { DatosBancariosPublic } from '../services/empresa-datos-bancarios.service';

import type { OrderLineEmailItem } from '../types/email.types';



export interface ManualPaymentInstructionsEmailProps {

  customerEmail: string;

  customerName: string;

  orderId: number;

  externalOrderId: string;

  formaPago: 'transferencia' | 'efectivo';

  totalFormatted: string;

  expiresAtFormatted?: string;

  bank?: DatosBancariosPublic | null;

  nextSteps?: string | null;

  facturacion?: {

    tipo: 'A' | 'C';

    cuit: string;

    razonSocial: string;

  };

  items: OrderLineEmailItem[];

}



export function ManualPaymentInstructionsEmail(

  props: ManualPaymentInstructionsEmailProps

): React.ReactElement {

  const isTransfer = props.formaPago === 'transferencia';

  const title = isTransfer ? 'Instrucciones para transferir' : 'Pedido registrado — pago en efectivo';

  const preview = isTransfer

    ? `Pedido #${props.orderId} — datos para transferir`

    : `Pedido #${props.orderId} — pago en efectivo`;



  return (

    <BaseLayout previewText={preview}>

      <Section>

        <Heading style={h1}>{title}</Heading>

        <Text style={text}>Hola {props.customerName},</Text>

        <Text style={text}>

          Registramos tu pedido <strong>{props.externalOrderId}</strong> (nº interno #{props.orderId}

          ). Total a abonar: <strong>{props.totalFormatted}</strong>.

        </Text>

        {props.expiresAtFormatted ? (

          <Text style={textMuted}>

            Tenés tiempo para abonar hasta el <strong>{props.expiresAtFormatted}</strong>.

          </Text>

        ) : null}



        {isTransfer && props.bank ? (

          <Section style={bankBox}>

            <Text style={bankTitle}>Datos para transferencia</Text>

            <Text style={bankLine}>

              <strong>Banco:</strong> {props.bank.banco}

            </Text>

            <Text style={bankLine}>

              <strong>Titular:</strong> {props.bank.titular}

            </Text>

            {props.bank.cuit ? (

              <Text style={bankLine}>

                <strong>CUIT:</strong> {props.bank.cuit}

              </Text>

            ) : null}

            {props.bank.tipoCuenta?.trim() ? (

              <Text style={bankLine}>

                <strong>Tipo de cuenta:</strong> {props.bank.tipoCuenta}

              </Text>

            ) : null}

            {props.bank.numeroCuenta?.trim() ? (

              <Text style={bankLine}>

                <strong>Nº de cuenta:</strong> {props.bank.numeroCuenta}

              </Text>

            ) : null}

            {props.bank.cbu ? (

              <Text style={bankLine}>

                <strong>CBU:</strong> {props.bank.cbu}

              </Text>

            ) : null}

            {props.bank.alias ? (

              <Text style={bankLine}>

                <strong>Alias:</strong> {props.bank.alias}

              </Text>

            ) : null}

            {props.bank.instrucciones ? (

              <Text style={textMuted}>{props.bank.instrucciones}</Text>

            ) : null}

          </Section>

        ) : isTransfer ? (

          <Text style={textMuted}>

            Los datos bancarios se están actualizando. Te contactaremos a la brevedad con la

            información para transferir.

          </Text>

        ) : null}



        {props.nextSteps ? (

          <Text style={importantBox}>

            <strong>Próximo paso:</strong> {props.nextSteps}

          </Text>

        ) : null}



        {props.facturacion ? (

          <Text style={text}>

            <strong>Facturación solicitada:</strong> Factura {props.facturacion.tipo} — CUIT{' '}

            {props.facturacion.cuit} — {props.facturacion.razonSocial}

          </Text>

        ) : null}



        <Hr style={hr} />

        <Text style={bankTitle}>Resumen del pedido</Text>

        {props.items.map((it, i) => (

          <Text key={i} style={textMuted}>

            {it.nombre} × {it.cantidad} — {it.subtotalFormatted}

          </Text>

        ))}

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

  margin: '0 0 12px',

};



const textMuted: React.CSSProperties = {

  color: '#555',

  fontSize: '14px',

  lineHeight: '22px',

  margin: '0 0 10px',

};



const importantBox: React.CSSProperties = {

  color: BRAND_COLORS.black,

  fontSize: '15px',

  lineHeight: '24px',

  margin: '16px 0 12px',

  backgroundColor: '#fffbeb',

  borderRadius: '8px',

  padding: '12px 14px',

  border: '1px solid #fcd34d',

};



const bankBox: React.CSSProperties = {

  backgroundColor: '#f5f5f5',

  borderRadius: '8px',

  padding: '16px',

  margin: '16px 0',

};



const bankTitle: React.CSSProperties = {

  color: BRAND_COLORS.black,

  fontSize: '16px',

  fontWeight: 700,

  margin: '0 0 10px',

};



const bankLine: React.CSSProperties = {

  color: BRAND_COLORS.black,

  fontSize: '14px',

  lineHeight: '22px',

  margin: '0 0 6px',

};



const hr: React.CSSProperties = {

  borderColor: '#e5e5e5',

  margin: '20px 0',

};

