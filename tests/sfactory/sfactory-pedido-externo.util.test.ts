import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveSfactoryPedidoFulfillmentMode } from '../../src/utils/sfactory-pedido-externo.util';
import {
  normalizeSfactoryClienteEmail,
  sfactoryPedidoExternoClienteSchema,
  toSfactoryPedidoExternoParams,
} from '../../src/validation/sfactory-pedido-externo.schema';
import { digitsOnly } from '../../src/utils/string-coerce.util';
import { normalizeClienteBusquedaItem } from '../../src/utils/cliente-busqueda.util';

afterEach(() => {
  delete process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE;
});

test('resolveSfactoryPedidoFulfillmentMode defaults to none', () => {
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'none');
});

test('resolveSfactoryPedidoFulfillmentMode reads env', () => {
  process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE = 'deliver';
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'deliver');
});

test('resolveSfactoryPedidoFulfillmentMode ignores invalid env', () => {
  process.env.SFACTORY_PEDIDO_FULFILLMENT_MODE = 'invalid';
  assert.equal(resolveSfactoryPedidoFulfillmentMode(), 'none');
});

test('toSfactoryPedidoExternoParams includes fulfillment_mode none by default', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    cliente: { email: 'a@b.com', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.fulfillment_mode, 'none');
});

test('toSfactoryPedidoExternoParams respects body fulfillment_mode override', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    fulfillment_mode: 'reserve',
    cliente: { email: 'a@b.com', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.fulfillment_mode, 'reserve');
});

test('normalizeSfactoryClienteEmail omits placeholders and invalid', () => {
  assert.equal(normalizeSfactoryClienteEmail('-'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('sin email'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('no-es-mail'), undefined);
  assert.equal(normalizeSfactoryClienteEmail('ok@example.com'), 'ok@example.com');
});

test('cliente schema rejects invalid email even with valid cuit', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: '20123456789',
    email: 'no-es-mail',
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(
      parsed.error.issues[0]?.message ?? '',
      /email del cliente no tiene un formato válido/
    );
  }
});

test('cliente schema accepts cuit with placeholder email', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: '20123456789',
    email: '-',
  });
  assert.equal(parsed.success, true);
});

test('cliente schema accepts cuit as number (SFactory / parseo)', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: 20123456789,
    nombre: 'Cliente Num',
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.cuit, '20123456789');
  }
});

test('cliente schema accepts telefono/movil as number', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: '20123456789',
    telefono: 3515551234,
    movil: 3515559999,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.telefono, '3515551234');
    assert.equal(parsed.data.movil, '3515559999');
  }
});

test('toSfactoryPedidoExternoParams omits placeholder email', () => {
  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'WEB-1',
    cliente: { cuit: '20123456789', email: '-', nombre: 'Test' },
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.cliente.email, undefined);
  assert.equal(params.cliente.cuit, '20123456789');
});

test('toSfactoryPedidoExternoParams normalizes numeric cuit without .replace crash', () => {
  const parsed = sfactoryPedidoExternoClienteSchema.safeParse({
    cuit: 30712345678,
    nombre: 'Empresa SA',
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const params = toSfactoryPedidoExternoParams({
    source: 'ecommerce',
    ext_order_id: 'MANUAL-1',
    cliente: parsed.data,
    items: [{ sku: 'SKU-1', cantidad: 1, precio: 10 }],
  });
  assert.equal(params.cliente.cuit, '30712345678');
});

test('digitsOnly accepts number and hyphenated string', () => {
  assert.equal(digitsOnly(20123456789), '20123456789');
  assert.equal(digitsOnly('20-12345678-9'), '20123456789');
  assert.equal(digitsOnly(null), '');
  assert.equal(digitsOnly(undefined), '');
});

test('normalizeClienteBusquedaItem maps SFactory tax_id number → cuit string', () => {
  const item = normalizeClienteBusquedaItem({
    id: 99,
    code: 'C-99',
    legal_name: 'Acme SA',
    name: 'Acme',
    tax_id: 30712345678,
    email: 'acme@example.com',
    phones: 3511111111,
    mobile: 3512222222,
    active: 1,
  });
  assert.equal(item.cuit, '30712345678');
  assert.equal(item.razonSocial, 'Acme SA');
  assert.equal(item.nombre, 'Acme');
  assert.equal(item.sfactoryCodigo, 'C-99');
  assert.equal(item.telefono, '3511111111');
  assert.equal(item.movil, '3512222222');
  assert.equal(item.sfactoryId, 99);
  assert.equal(typeof item.cuit, 'string');
});

test('normalizeClienteBusquedaItem keeps local Prisma shape with string cuit', () => {
  const item = normalizeClienteBusquedaItem({
    id: 5,
    sfactoryId: 88,
    sfactoryCodigo: 'LOC-1',
    razonSocial: 'Local SA',
    nombre: 'Local',
    cuit: '20123456789',
    email: 'local@example.com',
    telefono: '3510000000',
    activo: true,
  });
  assert.equal(item.cuit, '20123456789');
  assert.equal(item.razonSocial, 'Local SA');
  assert.equal(item.sfactoryId, 88);
});
