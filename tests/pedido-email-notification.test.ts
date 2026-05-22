import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FormaPago, OrderStatus, type Pedido, type PedidoItem } from '@prisma/client';
import { buildOrderEmailPayloadFromPedido } from '../src/services/pedido-email-notification.service';

type PedidoConItems = Pedido & { items: PedidoItem[] };

function makePedido(overrides: Record<string, unknown> = {}): PedidoConItems {
  return {
    id: 47,
    empresaId: 1,
    usuarioId: 1,
    sfactoryExternalOrderId: 'WEB-47',
    estadoInterno: 'confirmado',
    clienteNombre: 'Juan Pérez',
    clienteEmail: 'juan@test.com',
    clienteTelefono: '3511234567',
    subtotal: 1000,
    descuento: 0,
    iva: 210,
    total: 1210,
    costoEnvio: 0,
    formaEnvio: null,
    formaPago: FormaPago.mercado_pago,
    checkoutEnvioSnapshot: null,
    entregaCp: null,
    andreaniSucursalId: null,
    cantidadPrendas: 1,
    observaciones: null,
    items: [
      {
        id: 1,
        pedidoId: 47,
        nombre: 'Remera',
        cantidad: 1,
        precioUnitario: 1000,
        subtotal: 1000,
        talle: 'M',
        color: null,
      },
    ],
    ...overrides,
  } as unknown as PedidoConItems;
}

describe('buildOrderEmailPayloadFromPedido', () => {
  it('CONFIRMED retiro en tienda incluye shippingSummary, instrucciones y lead', () => {
    const payload = buildOrderEmailPayloadFromPedido(makePedido(), OrderStatus.CONFIRMED);

    assert.strictEqual(payload.shippingSummary, 'Retiro en tienda');
    assert.ok(payload.deliveryInstructions?.includes('WEB-47'));
    assert.ok(payload.deliveryInstructions?.includes('Alta Córdoba'));
    assert.ok(
      payload.statusUiOverrides?.lead?.includes('Te avisaremos por email cuando esté listo para retirar')
    );
  });

  it('CONFIRMED envío domicilio incluye lead de despacho', () => {
    const payload = buildOrderEmailPayloadFromPedido(
      makePedido({
        costoEnvio: 1500,
        checkoutEnvioSnapshot: {
          provider: 'andreani',
          deliveryType: 'homeDelivery',
          cpDestino: '5000',
          address: { streetName: 'Av. Colón', streetNumber: '100', city: 'Córdoba', zipCode: '5000' },
        },
      }),
      OrderStatus.CONFIRMED
    );

    assert.strictEqual(payload.status, OrderStatus.CONFIRMED);
    assert.ok(payload.shippingSummary?.includes('Andreani'));
    assert.ok(payload.deliveryInstructions?.includes('despachemos'));
    assert.ok(payload.statusUiOverrides?.lead?.includes('cuando despachemos'));
  });

  it('CONFIRMED envío sucursal incluye lead de sucursal', () => {
    const payload = buildOrderEmailPayloadFromPedido(
      makePedido({
        costoEnvio: 800,
        checkoutEnvioSnapshot: {
          provider: 'correo',
          deliveryType: 'agency',
          agencyLabel: 'Sucursal Centro',
          cpDestino: '5000',
        },
      }),
      OrderStatus.CONFIRMED
    );

    assert.ok(payload.shippingSummary?.includes('Sucursal Centro'));
    assert.ok(payload.statusUiOverrides?.lead?.includes('sucursal indicada'));
  });

  it('respeta statusUiOverrides manuales en CONFIRMED', () => {
    const payload = buildOrderEmailPayloadFromPedido(makePedido(), OrderStatus.CONFIRMED, {
      statusUiOverrides: { title: 'Listo para retirar', lead: 'Custom lead' },
    });

    assert.strictEqual(payload.statusUiOverrides?.title, 'Listo para retirar');
    assert.strictEqual(payload.statusUiOverrides?.lead, 'Custom lead');
  });

  it('deliveryInstructions explícitas pisan las de entrega', () => {
    const payload = buildOrderEmailPayloadFromPedido(makePedido(), OrderStatus.IN_PROCESS, {
      deliveryInstructions: 'Instrucciones admin',
    });

    assert.strictEqual(payload.deliveryInstructions, 'Instrucciones admin');
  });

  it('IN_PROCESS listo para retirar con overrides (mail admin)', () => {
    const payload = buildOrderEmailPayloadFromPedido(makePedido(), OrderStatus.IN_PROCESS, {
      statusUiOverrides: {
        title: 'Listo para retirar',
        lead: 'Tu pedido WEB-47 ya está listo para retirar.',
        icon: '📍',
        bannerBg: '#1B5E20',
      },
      deliveryInstructions: 'Tu pedido WEB-47 ya está listo para retirar. Dirección: Alta Córdoba.',
    });

    assert.strictEqual(payload.statusUiOverrides?.title, 'Listo para retirar');
    assert.ok(payload.deliveryInstructions?.includes('listo para retirar'));
  });

  it('DELIVERED retirado con lead breve', () => {
    const payload = buildOrderEmailPayloadFromPedido(makePedido(), OrderStatus.DELIVERED, {
      statusUiOverrides: {
        lead: 'Registramos que retiraste tu pedido. ¡Gracias por elegirnos!',
      },
    });

    assert.ok(payload.statusUiOverrides?.lead?.includes('retiraste'));
  });
});
