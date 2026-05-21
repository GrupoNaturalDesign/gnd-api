import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mapPedidoToAndreaniOrdenEnvio } from '../../../src/services/shipping/andreani/andreani.mapper';
import { ShippingValidationError } from '../../../src/services/shipping/shipping.errors';
import { Prisma } from '@prisma/client';

describe('SH-A-02 — mapPedidoToAndreaniOrdenEnvio', () => {
  beforeEach(() => {
    process.env.ANDREANI_CLIENTE = 'TEST-CLIENTE';
    process.env.ANDREANI_CONTRATO_DOM = 'CONTRATO-DOM';
    process.env.ANDREANI_CONTRATO_SUC = 'CONTRATO-SUC';
    process.env.ANDREANI_SUCURSAL_CLIENTE_ID = '99';
    process.env.ANDREANI_TIPO_SERVICIO = 'B2C';
    process.env.ANDREANI_ORIGEN_CP = '5000';
    process.env.ANDREANI_ORIGEN_CALLE = 'Calle Origen';
    process.env.ANDREANI_ORIGEN_NUMERO = '123';
    process.env.ANDREANI_ORIGEN_LOCALIDAD = 'Córdoba';
    process.env.ANDREANI_ORIGEN_REGION = 'Córdoba';
    process.env.ANDREANI_ORIGEN_PAIS = 'Argentina';
    process.env.ANDREANI_REMITENTE_NOMBRE = 'Remitente Test';
    process.env.ANDREANI_REMITENTE_EMAIL = 'envios@test.com';
    process.env.ANDREANI_REMITENTE_TELEFONO = '3510000000';
    process.env.ANDREANI_REMITENTE_DOC_TIPO = 'DNI';
    process.env.ANDREANI_REMITENTE_DOC_NUM = '12345678';
  });

  afterEach(() => {
    const keys = [
      'ANDREANI_CLIENTE', 'ANDREANI_CONTRATO_DOM', 'ANDREANI_CONTRATO_SUC',
      'ANDREANI_SUCURSAL_CLIENTE_ID', 'ANDREANI_TIPO_SERVICIO',
      'ANDREANI_ORIGEN_CP', 'ANDREANI_ORIGEN_CALLE', 'ANDREANI_ORIGEN_NUMERO',
      'ANDREANI_ORIGEN_LOCALIDAD', 'ANDREANI_ORIGEN_REGION', 'ANDREANI_ORIGEN_PAIS',
      'ANDREANI_REMITENTE_NOMBRE', 'ANDREANI_REMITENTE_EMAIL',
      'ANDREANI_REMITENTE_TELEFONO', 'ANDREANI_REMITENTE_DOC_TIPO',
      'ANDREANI_REMITENTE_DOC_NUM',
    ];
    for (const k of keys) delete process.env[k];
  });

  it('domicilio setea contrato_dom, con destino.postal', () => {
    const result = mapPedidoToAndreaniOrdenEnvio(buildInput('homeDelivery'), buildPedido());
    assert.strictEqual(result.contrato, 'CONTRATO-DOM');
    assert.ok(result.destino);
    const dest = result.destino as Record<string, unknown>;
    assert.ok(dest.postal);
    assert.strictEqual((dest.postal as Record<string, unknown>)['calle'], 'Calle Dest');
  });

  it('sucursal setea contrato_suc, con destino.sucursal', () => {
    const result = mapPedidoToAndreaniOrdenEnvio(buildInput('agency', 'SUC-123'), buildPedido());
    assert.strictEqual(result.contrato, 'CONTRATO-SUC');
    assert.ok(result.destino);
    const dest = result.destino as Record<string, unknown>;
    assert.ok(dest.sucursal);
    const suc = dest.sucursal as Record<string, unknown>;
    assert.strictEqual(suc.id, 'SUC-123');
  });

  it('lanza si falta ANDREANI_CLIENTE', () => {
    delete process.env.ANDREANI_CLIENTE;
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(buildInput('homeDelivery'), buildPedido()),
      /ANDREANI_CLIENTE/
    );
  });

  it('lanza si falta ANDREANI_CONTRATO_DOM para domicilio', () => {
    delete process.env.ANDREANI_CONTRATO_DOM;
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(buildInput('homeDelivery'), buildPedido()),
      /ANDREANI_CONTRATO_DOM/
    );
  });

  it('lanza si falta ANDREANI_CONTRATO_SUC para sucursal', () => {
    delete process.env.ANDREANI_CONTRATO_SUC;
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(buildInput('agency'), buildPedido()),
      /ANDREANI_CONTRATO_SUC/
    );
  });

  it('lanza si falta teléfono en recipient y pedido', () => {
    const input = buildInput('homeDelivery');
    input.recipient.phone = '';
    const pedido = buildPedido('  ');
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(input, pedido),
      /falta teléfono/
    );
  });

  it('usa teléfono de pedido.clienteTelefono cuando recipient.phone vacío', () => {
    const telefonoPedido = buildPedido('3519999999');
    const testInput = {
      pedidoId: 1,
      empresaId: 1,
      recipient: { name: 'Test', email: 'dest@test.com' },
      deliveryType: 'homeDelivery' as const,
      address: {
        streetName: 'Calle Dest',
        streetNumber: '456',
        city: 'Rosario',
        state: 'Santa Fe',
        zipCode: '2000',
      },
      parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
    } as import('../../../src/services/shipping/shipping.types').CreateShippingOrderInput;
    const result = mapPedidoToAndreaniOrdenEnvio(testInput, telefonoPedido);
    const dest = (result.destinatario as Array<Record<string, unknown>>)[0]!;
    assert.ok(dest.telefonos);
    const tels = dest.telefonos as Array<{ tipo: number; numero: string }>;
    assert.strictEqual(tels[0]!.numero, '3519999999');
  });

  it('sucursal sin agencyId ni andreaniSucursalId lanza', () => {
    const input = buildInput('agency');
    input.agencyId = undefined;
    const pedido = buildPedido();
    pedido.andreaniSucursalId = null;
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(input, pedido),
      /falta agencyId/
    );
  });

  it('domicilio sin address lanza', () => {
    const input = buildInput('homeDelivery');
    input.address = undefined;
    assert.throws(
      () => mapPedidoToAndreaniOrdenEnvio(input, buildPedido()),
      /falta address/
    );
  });

  it('kilos se calcula correctamente (grams → kg)', () => {
    const result = mapPedidoToAndreaniOrdenEnvio(buildInput('homeDelivery'), buildPedido());
    const bultos = result.bultos as Array<Record<string, unknown>>;
    assert.ok(bultos.length > 0);
    assert.strictEqual(bultos[0]!.kilos, 0.5);
  });

  it('kilos mínimo 0.001 para bultos muy livianos', () => {
    const input = buildInput('homeDelivery');
    input.parcel.weightGrams = 1;
    const result = mapPedidoToAndreaniOrdenEnvio(input, buildPedido());
    const bultos = result.bultos as Array<Record<string, unknown>>;
    assert.strictEqual(bultos[0]!.kilos, 0.001);
  });

  it('idPedido格式 WEB-{id}', () => {
    const result = mapPedidoToAndreaniOrdenEnvio(buildInput('homeDelivery'), buildPedido());
    assert.strictEqual(result.idPedido, 'WEB-999');
  });
});

function buildInput(
  deliveryType: 'homeDelivery' | 'agency',
  agencyId?: string
) {
  return {
    pedidoId: 1,
    empresaId: 1,
    recipient: { name: 'Test Dest', email: 'dest@test.com', phone: '3515550000' },
    deliveryType: deliveryType as 'homeDelivery' | 'agency',
    address: deliveryType === 'homeDelivery' ? {
      streetName: 'Calle Dest',
      streetNumber: '456',
      city: 'Rosario',
      state: 'Santa Fe',
      zipCode: '2000',
    } : undefined,
    agencyId,
    parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
  };
}

function buildPedido(telefonoOverride?: string) {
  return {
    id: 999,
    empresaId: 1,
    clienteEmail: 'cliente@test.com',
    clienteTelefono: telefonoOverride ?? '3515550000',
    clienteNombre: 'Test',
    subtotal: new Prisma.Decimal(100),
    iva: new Prisma.Decimal(21),
    total: new Prisma.Decimal(121),
    estadoInterno: 'carrito',
    estadoPago: 'pendiente',
    andreaniSucursalId: null as string | null,
    andreaniSucursalDescripcion: null as string | null,
  } as unknown as import('@prisma/client').Pedido;
}