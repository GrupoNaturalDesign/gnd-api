import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EstadoPedido } from '@prisma/client';
import { requiresPostalShipping } from '../../src/utils/pedido-entrega.util';
import { resolvePedidoShippingTracking } from '../../src/utils/pedido-shipping-tracking.util';
import { procesarPedidoConfirmado } from '../../src/services/pedido-checkout.service';
import { pedidoSyncService } from '../../src/services/pedido-sync.service';
import { sfactoryService } from '../../src/services/sfactory/sfactory.service';
import { adminNotificationService } from '../../src/services/admin-notification.service';
import * as pedidoEmailNotification from '../../src/services/pedido-email-notification.service';
import * as pedidoStockSync from '../../src/services/sync/pedido-stock-sync.util';
import { shippingService } from '../../src/services/shipping/shipping.service';
import { MOCK_TRACKING } from '../../src/services/shipping/andreani/andreani.mock';
import {
  createManualShippingLifecycleState,
  installManualShippingLifecyclePrismaStub,
} from '../helpers/manual-shipping-lifecycle-prisma';
import {
  GOLDEN_EMPRESA_ID,
  GOLDEN_PEDIDO_MANUAL_POSTAL_ID,
  buildManualPostalPedidoPending,
  goldenClienteRow,
  goldenEmpresaRow,
  goldenPedidoItems,
  goldenProductoWebRow,
  goldenSfactoryCamisaRow,
  makeGoldenEnvioConfig,
} from '../shipping/fixtures/golden-path-pedidos';

type SfactoryServiceMutable = {
  crearPedidoExterno: typeof sfactoryService.crearPedidoExterno;
};

type AdminNotificationMutable = {
  notifyPedido: typeof adminNotificationService.notifyPedido;
  createAndEmit: typeof adminNotificationService.createAndEmit;
};

type PedidoEmailMutable = {
  sendPedidoStatusEmail: typeof pedidoEmailNotification.sendPedidoStatusEmail;
  sendPedidoStatusEmailAsync: typeof pedidoEmailNotification.sendPedidoStatusEmailAsync;
};

type PedidoStockSyncMutable = {
  syncStockPedidoItemsAsync: typeof pedidoStockSync.syncStockPedidoItemsAsync;
};

const sfactoryMutable = sfactoryService as unknown as SfactoryServiceMutable;
const adminMutable = adminNotificationService as unknown as AdminNotificationMutable;
const emailMutable = pedidoEmailNotification as unknown as PedidoEmailMutable;
const stockMutable = pedidoStockSync as unknown as PedidoStockSyncMutable;

const origSfactoryCreate = sfactoryMutable.crearPedidoExterno;
const origAdminNotify = adminMutable.notifyPedido;
const origAdminCreate = adminMutable.createAndEmit;
const origSendEmail = emailMutable.sendPedidoStatusEmail;
const origSendEmailAsync = emailMutable.sendPedidoStatusEmailAsync;
const origSyncStock = stockMutable.syncStockPedidoItemsAsync;

function resetShippingProviderCaches(): void {
  shippingService.invalidateCorreoProviderCache();
  (
    shippingService as unknown as { andreaniProviders: Map<string, unknown> }
  ).andreaniProviders.clear();
}

function setAndreaniEnvForFinalize(): void {
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
  process.env.ANDREANI_MOCK = 'true';
  process.env.SHIPPING_ALTO_POR_PRENDA_CM = '8';
}

describe('manual + envío postal — ciclo operativo', () => {
  let prismaStub: { restore: () => void } | null = null;
  const prevEnv: Record<string, string | undefined> = {};

  function saveEnv(key: string) {
    prevEnv[key] = process.env[key];
  }

  beforeEach(() => {
    sfactoryMutable.crearPedidoExterno = async () =>
      ({ id: 9901, estado: '2', total: 40000 }) as never;
    adminMutable.notifyPedido = async () => ({ id: 1 }) as never;
    adminMutable.createAndEmit = async () => ({ id: 1 }) as never;
    emailMutable.sendPedidoStatusEmail = async () => {};
    emailMutable.sendPedidoStatusEmailAsync = () => {};
    stockMutable.syncStockPedidoItemsAsync = () => {};

    saveEnv('SFACTORY_PEDIDO_EXTERNO_SOURCE');
    process.env.SFACTORY_PEDIDO_EXTERNO_SOURCE = 'golden-test-source';
    setAndreaniEnvForFinalize();
    resetShippingProviderCaches();
  });

  afterEach(() => {
    prismaStub?.restore();
    prismaStub = null;
    sfactoryMutable.crearPedidoExterno = origSfactoryCreate;
    adminMutable.notifyPedido = origAdminNotify;
    adminMutable.createAndEmit = origAdminCreate;
    emailMutable.sendPedidoStatusEmail = origSendEmail;
    emailMutable.sendPedidoStatusEmailAsync = origSendEmailAsync;
    stockMutable.syncStockPedidoItemsAsync = origSyncStock;
    for (const [key, val] of Object.entries(prevEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    resetShippingProviderCaches();
  });

  function installPendingPostalState() {
    const pedido = buildManualPostalPedidoPending();
    const items = goldenPedidoItems(GOLDEN_PEDIDO_MANUAL_POSTAL_ID);
    const state = createManualShippingLifecycleState(
      pedido,
      items,
      makeGoldenEnvioConfig('andreani') as never,
      [goldenProductoWebRow],
      [goldenSfactoryCamisaRow],
      goldenEmpresaRow as never,
      goldenClienteRow as never
    );
    prismaStub = installManualShippingLifecyclePrismaStub(state);
    return state;
  }

  it('pre-aprobación: envío postal guardado, sin SF ni tracking', () => {
    const state = installPendingPostalState();
    const pedido = state.pedidos.get(GOLDEN_PEDIDO_MANUAL_POSTAL_ID)!;

    assert.equal(pedido.estadoInterno, EstadoPedido.pendiente_confirmacion);
    assert.equal(pedido.sfactoryOrdenId, null);
    assert.equal(pedido.stockReservadoWeb, true);
    assert.ok(requiresPostalShipping(pedido));
    assert.equal(resolvePedidoShippingTracking(pedido).trackingNumber, null);
    assert.equal(state.envioLogs.length, 0);
  });

  it('admin aprobar → procesarPedidoConfirmado crea SF y dispara envío postal', async () => {
    const state = installPendingPostalState();

    const result = await procesarPedidoConfirmado(GOLDEN_PEDIDO_MANUAL_POSTAL_ID);
    assert.equal(result.ok, true);

    const updated = state.pedidos.get(GOLDEN_PEDIDO_MANUAL_POSTAL_ID)!;
    assert.equal(updated.estadoInterno, EstadoPedido.confirmado);
    assert.equal(updated.sfactoryOrdenId, 9901);
    assert.equal(updated.andreaniNumeroEnvio, MOCK_TRACKING);
    assert.ok(state.sfactoryLogs.length >= 1);
    assert.ok(state.envioLogs.length >= 1);
  });

  it('pedidoSyncService.confirmar delega a procesarPedidoConfirmado en pendiente_confirmacion', async () => {
    const state = installPendingPostalState();

    const result = await pedidoSyncService.confirmar(
      GOLDEN_EMPRESA_ID,
      GOLDEN_PEDIDO_MANUAL_POSTAL_ID
    );
    assert.equal(result.ok, true);

    const updated = state.pedidos.get(GOLDEN_PEDIDO_MANUAL_POSTAL_ID)!;
    assert.equal(updated.estadoInterno, EstadoPedido.confirmado);
    assert.equal(updated.andreaniNumeroEnvio, MOCK_TRACKING);
  });
});
