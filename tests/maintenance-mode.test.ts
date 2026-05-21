import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMaintenanceMode,
  MaintenanceMode,
  isPublicMaintenanceBlocked,
  isAdminMaintenanceBlocked,
} from '../src/lib/maintenance-mode';

describe('maintenance-mode', () => {
  it('valores válidos', () => {
    assert.equal(parseMaintenanceMode('off'), MaintenanceMode.Off);
    assert.equal(parseMaintenanceMode('public'), MaintenanceMode.Public);
    assert.equal(parseMaintenanceMode('admin'), MaintenanceMode.Admin);
    assert.equal(parseMaintenanceMode('all'), MaintenanceMode.All);
    assert.equal(parseMaintenanceMode('PUBLIC'), MaintenanceMode.Public);
  });

  it('inválido o vacío → off', () => {
    assert.equal(parseMaintenanceMode(undefined), MaintenanceMode.Off);
    assert.equal(parseMaintenanceMode(''), MaintenanceMode.Off);
    assert.equal(parseMaintenanceMode('invalid'), MaintenanceMode.Off);
  });

  it('flags de bloqueo', () => {
    assert.equal(isPublicMaintenanceBlocked(MaintenanceMode.Off), false);
    assert.equal(isPublicMaintenanceBlocked(MaintenanceMode.Admin), false);
    assert.equal(isPublicMaintenanceBlocked(MaintenanceMode.Public), true);
    assert.equal(isPublicMaintenanceBlocked(MaintenanceMode.All), true);

    assert.equal(isAdminMaintenanceBlocked(MaintenanceMode.Off), false);
    assert.equal(isAdminMaintenanceBlocked(MaintenanceMode.Public), false);
    assert.equal(isAdminMaintenanceBlocked(MaintenanceMode.Admin), true);
    assert.equal(isAdminMaintenanceBlocked(MaintenanceMode.All), true);
  });
});
