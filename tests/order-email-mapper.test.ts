import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mapCheckoutBodyToOrderEmailPayload } from '../src/services/order-email-mapper.service';
import { OrderStatus } from '@prisma/client';

describe('mapCheckoutBodyToOrderEmailPayload', () => {
  it('mapea body completo a payload de email', () => {
    const body = {
      to: 'juan@test.com',
      subject: 'Confirmación de pedido',
      customerData: {
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'juan@test.com',
        telefono: '+5491155555555',
      },
      items: [
        {
          product: { id: 1, nombre: 'Remera', precio: 1000, precioLista: 1200 },
          quantity: 2,
          subtotal: 2000,
          especificaciones: 'M',
          bordado: true,
        },
      ],
      itemCount: 2,
      subtotal: 2000,
      iva: 210,
      total: 2210,
      shippingData: {
        tipo: 'envio' as const,
        direccion: 'Calle Falsa 123',
        localidad: 'CABA',
        provincia: 'Buenos Aires',
        codigo_postal: '1001',
        checkoutEnvio: { 
          provider: 'correo' as const, 
          deliveryType: 'homeDelivery' as const, 
          parcel: { weightGrams: 500, height: 10, width: 10, depth: 5, declaredValue: 1000 }, 
          cpDestino: '1001', 
          clientQuotedAmount: 500 
        },
      },
      paymentData: {
        metodo: 'mercado_pago',
        notas: 'Pagar con QR',
      },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.customerName, 'Juan Pérez');
    assert.strictEqual(result.customerEmail, 'juan@test.com');
    assert.strictEqual(result.customerPhone, '+5491155555555');
    assert.strictEqual(result.items.length, 1);
    const firstItem = result.items[0]!;
    assert.strictEqual(firstItem.nombre, 'Remera');
    assert.strictEqual(firstItem.cantidad, 2);
    assert.strictEqual(result.itemCount, 2);
    assert.strictEqual(result.status, OrderStatus.PENDING);
    assert.ok(result.shippingSummary?.includes('Envío estimado'));
    assert.ok(result.paymentSummary?.includes('Mercado Pago'));
  });

  it('construye shippingSummary para retiro en tienda', () => {
    const body = {
      to: 'ana@test.com',
      customerData: { nombre: 'Ana', apellido: 'Gómez', email: 'ana@test.com', telefono: '1155555555' },
      items: [{ product: { id: 1, nombre: 'X', precio: 100 }, quantity: 1, subtotal: 100 }],
      itemCount: 1,
      subtotal: 100,
      iva: 21,
      total: 121,
      shippingData: { tipo: 'retiro' as const },
      paymentData: { metodo: 'efectivo' },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.shippingSummary, 'Retiro en local / coordinación');
  });

  it('construye shippingSummary sin quotedAmount', () => {
    const body = {
      to: 'ana@test.com',
      customerData: { nombre: 'Ana', apellido: 'Gómez', email: 'ana@test.com', telefono: '1155555555' },
      items: [{ product: { id: 1, nombre: 'X', precio: 100 }, quantity: 1, subtotal: 100 }],
      itemCount: 1,
      subtotal: 100,
      iva: 21,
      total: 121,
      shippingData: {
        tipo: 'envio' as const,
        direccion: 'Av. Siempre Viva 742',
        localidad: 'Springfield',
        provincia: 'Oregon',
        codigo_postal: '97477',
      },
      paymentData: { metodo: 'transferencia' },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.shippingSummary, 'Av. Siempre Viva 742, Springfield, Oregon, 97477');
  });

  it('concatena notas de payment y shipping en notes', () => {
    const body = {
      to: 'ana@test.com',
      customerData: { nombre: 'Ana', apellido: 'Gómez', email: 'ana@test.com', telefono: '1155555555' },
      items: [{ product: { id: 1, nombre: 'X', precio: 100 }, quantity: 1, subtotal: 100 }],
      itemCount: 1,
      subtotal: 100,
      iva: 21,
      total: 121,
      shippingData: { tipo: 'retiro' as const, notas: 'Pasar después de las 18hs' },
      paymentData: { metodo: 'efectivo', notas: 'Sin turno' },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.notes, 'Sin turno | Pasar después de las 18hs');
  });

  it('mapea metodo transferencia correctamente', () => {
    const body = {
      to: 'ana@test.com',
      customerData: { nombre: 'Ana', apellido: 'Gómez', email: 'ana@test.com', telefono: '1155555555' },
      items: [{ product: { id: 1, nombre: 'X', precio: 100 }, quantity: 1, subtotal: 100 }],
      itemCount: 1,
      subtotal: 100,
      iva: 21,
      total: 121,
      shippingData: { tipo: 'retiro' as const },
      paymentData: { metodo: 'transferencia' },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.paymentSummary, 'Transferencia');
  });

  it('mapea metodo tarjeta correctamente', () => {
    const body = {
      to: 'ana@test.com',
      customerData: { nombre: 'Ana', apellido: 'Gómez', email: 'ana@test.com', telefono: '1155555555' },
      items: [{ product: { id: 1, nombre: 'X', precio: 100 }, quantity: 1, subtotal: 100 }],
      itemCount: 1,
      subtotal: 100,
      iva: 21,
      total: 121,
      shippingData: { tipo: 'retiro' as const },
      paymentData: { metodo: 'tarjeta' },
    };

    const result = mapCheckoutBodyToOrderEmailPayload(body);

    assert.strictEqual(result.paymentSummary, 'Tarjeta');
  });
});