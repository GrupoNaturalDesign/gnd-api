import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import { buildPedidoExternoParams } from '../../src/services/pedido-checkout.service';

const BASE_PEDIDO: Parameters<typeof buildPedidoExternoParams>[0] = {
  id: 42,
  fechaPedido: new Date('2026-06-01T10:00:00Z'),
  observaciones: 'Test order',
  refCliente: 'REF-001',
  numOrdenCompra: null,
  clienteDireccion: 'Av. Siempre Viva 123',
  entregaCp: '5000',
  entregaNotas: 'Dejar en portería',
  clienteNombre: 'Juan Pérez',
  clienteEmail: 'juan@example.com',
  clienteTelefono: '3515551234',
  items: [
    {
      productoWebId: 100,
      codigo: 'CAM-001',
      nombre: 'Camisa Blanca',
      cantidad: new Prisma.Decimal(2),
      precioUnitario: new Prisma.Decimal(500),
      talle: 'M',
      color: 'Blanco',
      bordado: false,
    },
  ],
  cliente: {
    cuit: '20123456789',
    email: 'factura@example.com',
    razonSocial: 'Juan Pérez SA',
    telefono: '3515555678',
  },
};

function setSource(val: string): void {
  process.env.SFACTORY_PEDIDO_EXTERNO_SOURCE = val;
}

function clearSource(): void {
  delete process.env.SFACTORY_PEDIDO_EXTERNO_SOURCE;
}

describe('buildPedidoExternoParams', () => {
  beforeEach(() => {
    setSource('web');
    process.env.SFACTORY_ENTREGA_PROVINCIA_DEFAULT = 'Cordoba';
    process.env.SFACTORY_ENTREGA_LOCALIDAD_DEFAULT = 'Córdoba';
    delete process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE;
  });

  afterEach(() => {
    clearSource();
    delete process.env.SFACTORY_ENTREGA_PROVINCIA_DEFAULT;
    delete process.env.SFACTORY_ENTREGA_LOCALIDAD_DEFAULT;
    delete process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE;
  });

  it('builds valid params with full data', () => {
    const result = buildPedidoExternoParams(BASE_PEDIDO);
    assert.strictEqual(result.source, 'web');
    assert.strictEqual(result.ext_order_id, 'WEB-42');
    assert.strictEqual(result.cliente.cuit, '20123456789');
    assert.strictEqual(result.cliente.email, 'factura@example.com');
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0]?.sku, 'CAM-001');
    assert.strictEqual(result.fulfillment_mode, 'none');
    assert.strictEqual(result.entrega?.direccion, 'Av. Siempre Viva 123');
    assert.strictEqual(result.entrega?.cp, '5000');
  });

  it('throws when SFACTORY_PEDIDO_EXTERNO_SOURCE is missing', () => {
    clearSource();
    assert.throws(
      () => buildPedidoExternoParams(BASE_PEDIDO),
      /SFACTORY_PEDIDO_EXTERNO_SOURCE/
    );
  });

  it('throws when both cuit and email are missing', () => {
    const pedido = {
      ...BASE_PEDIDO,
      cliente: { cuit: null, email: null, razonSocial: null, telefono: null },
      clienteEmail: '',
    };
    assert.throws(
      () => buildPedidoExternoParams(pedido),
      /cuit.*email/
    );
  });

  it('throws when items array is empty', () => {
    const pedido = { ...BASE_PEDIDO, items: [] };
    assert.throws(
      () => buildPedidoExternoParams(pedido),
      /ítems/
    );
  });

  it('uses clienteEmail fallback when cliente is null', () => {
    const pedido = { ...BASE_PEDIDO, cliente: null };
    const result = buildPedidoExternoParams(pedido);
    assert.strictEqual(result.cliente.email, 'juan@example.com');
  });

  it('omits entrega when direccion or cp missing', () => {
    const pedido = { ...BASE_PEDIDO, clienteDireccion: null, entregaCp: null };
    const result = buildPedidoExternoParams(pedido);
    assert.strictEqual(result.entrega, undefined);
  });

  it('generates correct fecha and fecha_entrega (+7 days)', () => {
    const result = buildPedidoExternoParams(BASE_PEDIDO);
    assert.ok(result.fecha);
    assert.ok(result.fecha_entrega);
    assert.notStrictEqual(result.fecha, result.fecha_entrega);
  });

  it('defaults fulfillment_mode to none', () => {
    const result = buildPedidoExternoParams(BASE_PEDIDO);
    assert.strictEqual(result.fulfillment_mode, 'none');
    assert.strictEqual(result.shipping_type, undefined);
  });

  it('uses SFACTORY_PEDIDO_FULFILLMENT_MODE when set', () => {
    process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE = 'reserve';
    const result = buildPedidoExternoParams(BASE_PEDIDO);
    assert.strictEqual(result.fulfillment_mode, 'reserve');
  });
});
