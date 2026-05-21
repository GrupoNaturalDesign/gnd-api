import { describe, it } from 'node:test';
import assert from 'node:assert';

describe.skip('SH-S-03 — Sandbox smoke tests (manual)', () => {

  it('Correo real quote against sandbox apitest.micorreo.com.ar', async () => {
    assert.ok(process.env.CORREO_MOCK === undefined, 'Run with CORREO_MOCK=true to skip');
  });

  it('Andreani real quote against apisqa.andreani.com', async () => {
    assert.ok(process.env.ANDREANI_MOCK === undefined, 'Run with ANDREANI_MOCK=true to skip');
  });

  it('Correo real order create against apitest', async () => {
    assert.ok(false, 'manual only - requires real credentials');
  });

  it('Andreani real order create against QA', async () => {
    assert.ok(false, 'manual only - requires real credentials');
  });
});