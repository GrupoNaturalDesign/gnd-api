import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeTotalACobrar,
  parseSfactoryOrdenId,
  parseSfactoryEstado,
  parseSfactoryTotal,
} from '../src/utils/sfactory-pedido-response.util';

test('parseSfactoryTotal lee total en raíz y en data', () => {
  assert.equal(parseSfactoryTotal({ total: 12500.5 }), 12500.5);
  assert.equal(parseSfactoryTotal({ total: '9900' }), 9900);
  assert.equal(parseSfactoryTotal({ data: { total: 42 } }), 42);
  assert.equal(parseSfactoryTotal({}), null);
});

test('parseSfactoryOrdenId lee id numérico o string', () => {
  assert.equal(parseSfactoryOrdenId({ id: 77 }), 77);
  assert.equal(parseSfactoryOrdenId({ orden_id: '88' }), 88);
  assert.equal(parseSfactoryOrdenId({ data: { id: 99 } }), 99);
});

test('parseSfactoryEstado lee estado', () => {
  assert.equal(parseSfactoryEstado({ estado: '1' }), '1');
  assert.equal(parseSfactoryEstado({ Estado: '5' }), '5');
  assert.equal(parseSfactoryEstado({ data: { estado: '2' } }), '2');
  assert.equal(parseSfactoryEstado({ data: { estado: 2 } }), '2');
});

test('computeTotalACobrar suma productos ERP + envío GND', () => {
  assert.equal(computeTotalACobrar(10000, 6434), 16434);
  assert.equal(computeTotalACobrar(10000, 0), 10000);
});
