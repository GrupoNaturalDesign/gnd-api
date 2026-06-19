import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildCreateShippingOrderInputFromPedido,
  finalizeShippingAfterPaymentApproved,
} from '../../../src/services/checkout-shipping-finalize.service';
import { AndreaniProvider } from '../../../src/services/shipping/andreani/andreani.provider';
import { CorreoProvider } from '../../../src/services/shipping/correo/correo.provider';
import { shippingService } from '../../../src/services/shipping/shipping.service';
import { mapPedidoToAndreaniOrdenEnvio } from '../../../src/services/shipping/andreani/andreani.mapper';
import { MOCK_TRACKING } from '../../../src/services/shipping/andreani/andreani.mock';
import { getMockFetch } from '../../helpers/mock-fetch';
import {
  createGoldenPathState,
  installGoldenPathPrismaStub,
} from '../../helpers/shipping-golden-path-prisma';
import {
  GOLDEN_EMPRESA_ID,
  GOLDEN_PEDIDO_ANDREANI_ID,
  GOLDEN_PEDIDO_CORREO_ID,
  GOLDEN_PEDIDO_RETIRO_ID,
  andreaniHomeSnapshot,
  buildAndreaniHomePedido,
  buildCorreoAgencyPedido,
  buildRetiroPedido,
  expectedGoldenParcel,
  goldenPedidoItems,
  goldenProductoWebRow,
  goldenSfactoryCamisaRow,
  makeGoldenEnvioConfig,
} from '../fixtures/golden-path-pedidos';

function resetShippingProviderCaches(): void {
  shippingService.invalidateCorreoProviderCache();
  (
    shippingService as unknown as { andreaniProviders: Map<string, unknown> }
  ).andreaniProviders.clear();
}

function ensureFetchMock(): void {
  getMockFetch();
}

function setAndreaniEnvForMapper(): void {
  process.env.ANDREANI_CLIENTE = 'GOLDEN-CLIENTE';
  process.env.ANDREANI_CONTRATO_ENTREGA_DOMICILIO = 'CONTR-DOM';
  process.env.ANDREANI_CONTRATO_ENTREGA_SUCURSAL = 'CONTR-SUC';
  process.env.ANDREANI_CONTRATO_DOM = 'CONTR-DOM';
  process.env.ANDREANI_CONTRATO_SUC = 'CONTR-SUC';
  process.env.ANDREANI_SUCURSAL_CLIENTE_ID = '99';
  process.env.ANDREANI_TIPO_SERVICIO = 'B2C';
  process.env.ANDREANI_ORIGEN_CP = '5000';
  process.env.ANDREANI_ORIGEN_CALLE = 'Calle Origen';
  process.env.ANDREANI_ORIGEN_NUMERO = '123';
  process.env.ANDREANI_ORIGEN_LOCALIDAD = 'Córdoba';
  process.env.ANDREANI_ORIGEN_REGION = 'Córdoba';
  process.env.ANDREANI_ORIGEN_PAIS = 'Argentina';
  process.env.ANDREANI_REMITENTE_NOMBRE = 'GND';
  process.env.ANDREANI_REMITENTE_EMAIL = 'envios@gnd.test';
  process.env.ANDREANI_REMITENTE_TELEFONO = '3510000000';
  process.env.ANDREANI_REMITENTE_DOC_TIPO = 'DNI';
  process.env.ANDREANI_REMITENTE_DOC_NUM = '12345678';
}

function clearAndreaniEnvForMapper(): void {
  const keys = [
    'ANDREANI_CLIENTE',
    'ANDREANI_CONTRATO_DOM',
    'ANDREANI_CONTRATO_SUC',
    'ANDREANI_CONTRATO_ENTREGA_DOMICILIO',
    'ANDREANI_CONTRATO_ENTREGA_SUCURSAL',
    'ANDREANI_SUCURSAL_CLIENTE_ID',
    'ANDREANI_TIPO_SERVICIO',
    'ANDREANI_ORIGEN_CP',
    'ANDREANI_ORIGEN_CALLE',
    'ANDREANI_ORIGEN_NUMERO',
    'ANDREANI_ORIGEN_LOCALIDAD',
    'ANDREANI_ORIGEN_REGION',
    'ANDREANI_ORIGEN_PAIS',
    'ANDREANI_REMITENTE_NOMBRE',
    'ANDREANI_REMITENTE_EMAIL',
    'ANDREANI_REMITENTE_TELEFONO',
    'ANDREANI_REMITENTE_DOC_TIPO',
    'ANDREANI_REMITENTE_DOC_NUM',
    'ANDREANI_MOCK',
  ];
  for (const k of keys) delete process.env[k];
}

describe('checkout-shipping-finalize — golden path (prod-aligned)', () => {
  let prismaStub: { restore: () => void } | null = null;

  afterEach(() => {
    prismaStub?.restore();
    prismaStub = null;
    resetShippingProviderCaches();
    clearAndreaniEnvForMapper();
    delete process.env.CORREO_MOCK;
    delete process.env.CORREO_USERNAME_QA;
    delete process.env.CORREO_PASSWORD_QA;
    delete process.env.SHIPPING_ALTO_POR_PRENDA_CM;
  });

  describe('buildCreateShippingOrderInputFromPedido', () => {
    beforeEach(() => {
      process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
      const pedido = buildAndreaniHomePedido();
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items: goldenPedidoItems(pedido.id) }],
          makeGoldenEnvioConfig('andreani') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );
    });

    it('Andreani domicilio — arma input desde snapshot de checkout', async () => {
      const pedido = buildAndreaniHomePedido();
      const items = goldenPedidoItems(GOLDEN_PEDIDO_ANDREANI_ID);
      const expectedParcel = expectedGoldenParcel(40000);

      const built = await buildCreateShippingOrderInputFromPedido(pedido, items);
      assert.strictEqual(built.ok, true);
      if (!built.ok) return;

      assert.strictEqual(built.input.provider, 'andreani');
      assert.strictEqual(built.input.deliveryType, 'homeDelivery');
      assert.strictEqual(built.input.pedidoId, GOLDEN_PEDIDO_ANDREANI_ID);
      assert.strictEqual(built.input.empresaId, GOLDEN_EMPRESA_ID);
      assert.strictEqual(built.input.recipient.name, 'Juan Pérez');
      assert.strictEqual(built.input.recipient.email, 'juan.perez@example.com');
      assert.strictEqual(built.input.address?.streetName, 'Av. Colón');
      assert.strictEqual(built.input.address?.zipCode, '5000');
      assert.deepStrictEqual(built.input.parcel, expectedParcel);
    });

    it('Correo sucursal — usa agencyId del snapshot', async () => {
      const pedido = buildCorreoAgencyPedido();
      prismaStub?.restore();
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items: goldenPedidoItems(pedido.id) }],
          makeGoldenEnvioConfig('correo') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );

      const built = await buildCreateShippingOrderInputFromPedido(
        pedido,
        goldenPedidoItems(GOLDEN_PEDIDO_CORREO_ID)
      );
      assert.strictEqual(built.ok, true);
      if (!built.ok) return;

      assert.strictEqual(built.input.provider, 'correo');
      assert.strictEqual(built.input.deliveryType, 'agency');
      assert.strictEqual(built.input.agencyId, 'COR-SUC-001');
      assert.strictEqual(built.input.address, undefined);
    });

    it('retiro en tienda — no crea envío postal', async () => {
      const pedido = buildRetiroPedido();
      prismaStub?.restore();
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items: goldenPedidoItems(pedido.id) }],
          makeGoldenEnvioConfig('correo') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );
      const built = await buildCreateShippingOrderInputFromPedido(
        pedido,
        goldenPedidoItems(GOLDEN_PEDIDO_RETIRO_ID)
      );
      assert.strictEqual(built.ok, false);
      if (built.ok) return;
      assert.strictEqual(built.reason, 'retiro');
    });

    it('pedido con tracking existente — idempotente', async () => {
      const pedido = {
        ...buildAndreaniHomePedido(),
        andreaniNumeroEnvio: '360000102000579',
      };
      const built = await buildCreateShippingOrderInputFromPedido(
        pedido,
        goldenPedidoItems(GOLDEN_PEDIDO_ANDREANI_ID)
      );
      assert.strictEqual(built.ok, false);
      if (built.ok) return;
      assert.strictEqual(built.reason, 'already_has_tracking');
    });
  });

  describe('cadena prod: buildCreate → provider.createOrder', () => {
    it('Andreani — input del pedido → mapper → orden mock (mismo stack que prod)', async () => {
      process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
      process.env.ANDREANI_MOCK = 'true';
      setAndreaniEnvForMapper();
      ensureFetchMock();

      const pedido = buildAndreaniHomePedido();
      const items = goldenPedidoItems(GOLDEN_PEDIDO_ANDREANI_ID);
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items }],
          makeGoldenEnvioConfig('andreani') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );

      const built = await buildCreateShippingOrderInputFromPedido(pedido, items);
      assert.strictEqual(built.ok, true);
      if (!built.ok) return;

      const body = mapPedidoToAndreaniOrdenEnvio(built.input, pedido);
      assert.strictEqual(body.contrato, process.env.ANDREANI_CONTRATO_DOM);
      assert.ok(body.destino && typeof body.destino === 'object');

      const provider = new AndreaniProvider(
        'test',
        getMockFetch().fetch as unknown as typeof fetch
      );
      const result = await provider.createOrder(built.input);
      assert.strictEqual(result.provider, 'andreani');
      assert.strictEqual(result.trackingNumber, MOCK_TRACKING);
      assert.ok(result.andreaniAgrupadorBultos);
    });

    it('Correo — input del pedido → shipping/import (HTTP mock, sin CORREO_MOCK)', async () => {
      process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
      delete process.env.CORREO_MOCK;
      process.env.CORREO_USERNAME_QA = 'integrator';
      process.env.CORREO_PASSWORD_QA = 'secret';

      const mockFetch = getMockFetch();
      mockFetch.setResponses([
        { status: 200, json: { token: 'tok' } },
        { status: 200, json: { shippingId: 'COR-GOLDEN-999' } },
      ]);

      const pedido = buildCorreoAgencyPedido();
      const items = goldenPedidoItems(GOLDEN_PEDIDO_CORREO_ID);
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items }],
          makeGoldenEnvioConfig('correo') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );

      const built = await buildCreateShippingOrderInputFromPedido(pedido, items);
      assert.strictEqual(built.ok, true);
      if (!built.ok) return;

      const provider = new CorreoProvider(
        makeGoldenEnvioConfig('correo') as never,
        'test',
        mockFetch.fetch as unknown as typeof fetch
      );
      const result = await provider.createOrder(built.input);
      assert.strictEqual(result.provider, 'correo');
      assert.strictEqual(result.trackingNumber, 'COR-GOLDEN-999');
      assert.ok(mockFetch.getCallCount() >= 2);
    });
  });

  describe('finalizeShippingAfterPaymentApproved (post-pago prod)', () => {
    it('Andreani — pedido confirmado crea tracking vía ShippingService', async () => {
      process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
      process.env.ANDREANI_MOCK = 'true';
      setAndreaniEnvForMapper();
      ensureFetchMock();
      resetShippingProviderCaches();

      const pedido = {
        ...buildAndreaniHomePedido(),
        estadoInterno: 'confirmado' as const,
        sfactoryExternalOrderId: 'WEB-8801',
      };
      const items = goldenPedidoItems(GOLDEN_PEDIDO_ANDREANI_ID);
      const state = createGoldenPathState(
        [{ pedido, items }],
        makeGoldenEnvioConfig('andreani') as never,
        [goldenProductoWebRow],
        [goldenSfactoryCamisaRow]
      );
      prismaStub = installGoldenPathPrismaStub(state);

      const result = await finalizeShippingAfterPaymentApproved(GOLDEN_PEDIDO_ANDREANI_ID);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.trackingNumber, MOCK_TRACKING);
      assert.strictEqual(result.skipped, undefined);

      const updated = state.pedidos.get(GOLDEN_PEDIDO_ANDREANI_ID);
      assert.strictEqual(updated?.andreaniNumeroEnvio, MOCK_TRACKING);
      assert.ok(state.pedidoUpdates.length >= 1);
      assert.ok(state.envioLogs.some((l) => typeof l === 'object' && l !== null && 'operacion' in l));
    });

    it('retiro en tienda — finalize skipped', async () => {
      const pedido = buildRetiroPedido();
      const items = goldenPedidoItems(GOLDEN_PEDIDO_RETIRO_ID);
      prismaStub = installGoldenPathPrismaStub(
        createGoldenPathState(
          [{ pedido, items }],
          makeGoldenEnvioConfig('correo') as never,
          [goldenProductoWebRow],
          [goldenSfactoryCamisaRow]
        )
      );

      const result = await finalizeShippingAfterPaymentApproved(GOLDEN_PEDIDO_RETIRO_ID);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.skipped, true);
    });
  });

  describe('snapshot de checkout — formaEnvio coherente con prod', () => {
    it('andreaniHomeSnapshot refleja provider y domicilio del checkout', () => {
      assert.strictEqual(andreaniHomeSnapshot.provider, 'andreani');
      assert.strictEqual(andreaniHomeSnapshot.deliveryType, 'homeDelivery');
      assert.strictEqual(andreaniHomeSnapshot.address?.zipCode, '5000');
    });
  });
});

describe('checkout-shipping-finalize — shippingService.createOrder golden', () => {
  let prismaStub: { restore: () => void } | null = null;

  afterEach(() => {
    prismaStub?.restore();
    prismaStub = null;
    resetShippingProviderCaches();
    clearAndreaniEnvForMapper();
    delete process.env.ANDREANI_MOCK;
    delete process.env.SHIPPING_ALTO_POR_PRENDA_CM;
  });

  it('ShippingService.createOrder persiste tracking Andreani (mismo entry que admin reintento)', async () => {
    process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
    process.env.ANDREANI_MOCK = 'true';
    setAndreaniEnvForMapper();
    ensureFetchMock();
    resetShippingProviderCaches();

    const pedido = buildAndreaniHomePedido();
    const items = goldenPedidoItems(GOLDEN_PEDIDO_ANDREANI_ID);
    const state = createGoldenPathState(
      [{ pedido, items }],
      makeGoldenEnvioConfig('andreani') as never,
      [goldenProductoWebRow],
      [goldenSfactoryCamisaRow]
    );
    prismaStub = installGoldenPathPrismaStub(state);

    const built = await buildCreateShippingOrderInputFromPedido(pedido, items);
    assert.strictEqual(built.ok, true);
    if (!built.ok) return;

    const result = await shippingService.createOrder(built.input);
    assert.strictEqual(result.trackingNumber, MOCK_TRACKING);
    assert.strictEqual(state.pedidos.get(GOLDEN_PEDIDO_ANDREANI_ID)?.andreaniNumeroEnvio, MOCK_TRACKING);
  });
});
