import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MaintenanceMode } from '../src/lib/maintenance-mode';
import { resolveMaintenanceBlock } from '../src/middleware/maintenance.middleware';

describe('maintenance.middleware resolveMaintenanceBlock', () => {
  it('off no bloquea checkout', () => {
    assert.equal(
      resolveMaintenanceBlock('/api/checkout/mp', 'POST', MaintenanceMode.Off),
      null
    );
  });

  it('public bloquea checkout y no webhooks', () => {
    assert.equal(
      resolveMaintenanceBlock('/api/checkout/mp', 'POST', MaintenanceMode.Public),
      'public'
    );
    assert.equal(
      resolveMaintenanceBlock(
        '/api/webhooks/mercadopago',
        'POST',
        MaintenanceMode.Public
      ),
      null
    );
  });

  it('public bloquea catálogo y rutas admin de productos', () => {
    assert.equal(
      resolveMaintenanceBlock(
        '/api/productos/publicados',
        'GET',
        MaintenanceMode.Public
      ),
      'public'
    );
    assert.equal(
      resolveMaintenanceBlock(
        '/api/productos/1/completo',
        'GET',
        MaintenanceMode.Public
      ),
      null
    );
  });

  it('admin bloquea dashboard y no catálogo público', () => {
    assert.equal(
      resolveMaintenanceBlock(
        '/api/admin/dashboard',
        'GET',
        MaintenanceMode.Admin
      ),
      'admin'
    );
    assert.equal(
      resolveMaintenanceBlock(
        '/api/productos/publicados',
        'GET',
        MaintenanceMode.Admin
      ),
      null
    );
    assert.equal(
      resolveMaintenanceBlock('/api/checkout/mp', 'POST', MaintenanceMode.Admin),
      null
    );
  });

  it('all bloquea público y admin', () => {
    assert.equal(
      resolveMaintenanceBlock('/api/auth/register', 'POST', MaintenanceMode.All),
      'public'
    );
    assert.equal(
      resolveMaintenanceBlock(
        '/api/admin/usuarios',
        'GET',
        MaintenanceMode.All
      ),
      'admin'
    );
  });

  it('all bloquea catálogo público GET', () => {
    assert.equal(
      resolveMaintenanceBlock(
        '/api/productos/publicados',
        'GET',
        MaintenanceMode.All
      ),
      'public'
    );
  });

  it('allowlist health y ERP status', () => {
    assert.equal(
      resolveMaintenanceBlock('/api/health', 'GET', MaintenanceMode.All),
      null
    );
    assert.equal(
      resolveMaintenanceBlock('/api/orders/status', 'POST', MaintenanceMode.All),
      null
    );
  });
});
