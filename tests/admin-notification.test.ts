import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { AdminNotificationSeverity } from '@prisma/client';
import prisma from '../src/lib/prisma';
import { adminNotificationService } from '../src/services/admin-notification.service';

const testEntityId = `test-${Date.now()}`;

after(async () => {
  await prisma.adminNotification.deleteMany({
    where: { entityId: { startsWith: testEntityId } },
  });
  await prisma.$disconnect();
});

async function getEmpresaId(): Promise<number | null> {
  const empresa = await prisma.empresa.findFirst({ select: { id: true } });
  return empresa?.id ?? null;
}

test('adminNotificationService creates persistent notifications and counts unread', async (t) => {
  const empresaId = await getEmpresaId();
  if (!empresaId) {
    t.skip('No hay empresa en la base de test.');
    return;
  }

  const notification = await adminNotificationService.createAndEmit({
    empresaId,
    type: 'pedido.status_changed',
    severity: AdminNotificationSeverity.warning,
    title: 'Pedido de test',
    message: 'Cambio de estado de test',
    entityType: 'pedido',
    entityId: `${testEntityId}-create`,
    payload: { pedidoId: 999, estadoAnterior: 'pendiente_pago', estadoNuevo: 'confirmado' },
    dedupe: false,
  });

  const found = await prisma.adminNotification.findUnique({ where: { id: notification.id } });
  assert.ok(found);
  assert.equal(found?.empresaId, empresaId);
  assert.equal(found?.readAt, null);

  const count = await adminNotificationService.getUnreadCount(empresaId);
  assert.ok(count >= 1);
});

test('adminNotificationService marks one and all notifications as read', async (t) => {
  const empresaId = await getEmpresaId();
  if (!empresaId) {
    t.skip('No hay empresa en la base de test.');
    return;
  }

  const first = await adminNotificationService.createAndEmit({
    empresaId,
    type: 'pedido.sync_failed',
    severity: AdminNotificationSeverity.error,
    title: 'Error de test 1',
    message: 'Error SFactory',
    entityType: 'pedido',
    entityId: `${testEntityId}-read-1`,
    dedupe: false,
  });
  await adminNotificationService.createAndEmit({
    empresaId,
    type: 'pedido.sync_failed',
    severity: AdminNotificationSeverity.error,
    title: 'Error de test 2',
    message: 'Error SFactory',
    entityType: 'pedido',
    entityId: `${testEntityId}-read-2`,
    dedupe: false,
  });

  const one = await adminNotificationService.markRead(empresaId, first.id);
  assert.equal(one.count, 1);

  const all = await adminNotificationService.markAllRead(empresaId);
  assert.ok(all.count >= 1);
});

test('adminNotificationService deduplicates unread SFactory errors inside the window', async (t) => {
  const empresaId = await getEmpresaId();
  if (!empresaId) {
    t.skip('No hay empresa en la base de test.');
    return;
  }

  const input = {
    empresaId,
    type: 'pedido.sync_failed' as const,
    severity: AdminNotificationSeverity.error,
    title: 'Error SFactory dedupe',
    message: 'Error persistente',
    entityType: 'pedido',
    entityId: `${testEntityId}-dedupe`,
  };

  const first = await adminNotificationService.createAndEmit(input);
  const second = await adminNotificationService.createAndEmit(input);

  assert.equal(second.id, first.id);
});

