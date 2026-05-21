import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getProvinceCode, CORREO_ARG_PROVINCE_CODES } from '../src/services/shipping/correo/correo.types';
import { parseCorreoSenderData } from '../src/services/shipping/correo/correo.mapper';
import { ShippingValidationError } from '../src/services/shipping/shipping.errors';

describe('getProvinceCode', () => {
  it('mapea nombres normalizados a códigos', () => {
    assert.strictEqual(getProvinceCode('CABA'), 'C');
    assert.strictEqual(getProvinceCode('Ciudad Autónoma de Buenos Aires'), 'C');
    assert.strictEqual(getProvinceCode('Buenos Aires'), 'B');
    assert.strictEqual(getProvinceCode('Córdoba'), 'X');
    assert.strictEqual(getProvinceCode('Santa Fe'), 'S');
    assert.strictEqual(getProvinceCode('Mendoza'), 'M');
    assert.strictEqual(getProvinceCode('Tucumán'), 'T');
    assert.strictEqual(getProvinceCode('Chubut'), 'U');
  });

  it('acepta código de una letra directo', () => {
    assert.strictEqual(getProvinceCode('c'), 'C');
    assert.strictEqual(getProvinceCode('X'), 'X');
  });

  it('devuelve undefined para provincia inválida', () => {
    assert.strictEqual(getProvinceCode('Provincia Inventada'), undefined);
    assert.strictEqual(getProvinceCode(''), undefined);
  });

  it('normaliza tildes y acentos', () => {
    assert.strictEqual(getProvinceCode('Jujuy'), 'Y');
    assert.strictEqual(getProvinceCode('Neuquén'), 'Q');
    assert.strictEqual(getProvinceCode('Río Negro'), 'R');
  });

  it('case-insensitive', () => {
    assert.strictEqual(getProvinceCode('caba'), 'C');
    assert.strictEqual(getProvinceCode('CORDOBA'), 'X');
  });
});

describe('CORREO_ARG_PROVINCE_CODES', () => {
  it('contiene todas las letras del abecedario usadas', () => {
    const codes = Object.keys(CORREO_ARG_PROVINCE_CODES);
    assert.ok(codes.length >= 23);
    assert.ok(codes.includes('C'));
    assert.ok(codes.includes('B'));
  });
});

describe('parseCorreoSenderData', () => {
  it('parsea JSON válido con todos los campos', () => {
    const json = { name: 'Juan Pérez', email: 'juan@test.com', phone: '1155555555', streetName: 'Calle', streetNumber: '123', city: 'CABA' };
    const result = parseCorreoSenderData(json as any);
    assert.strictEqual(result.name, 'Juan Pérez');
    assert.strictEqual(result.email, 'juan@test.com');
    assert.strictEqual(result.phone, '1155555555');
    assert.strictEqual(result.streetName, 'Calle');
    assert.strictEqual(result.streetNumber, '123');
    assert.strictEqual(result.city, 'CABA');
  });

  it('parsea JSON válido solo con name', () => {
    const json = { name: 'Solo nombre' };
    const result = parseCorreoSenderData(json as any);
    assert.strictEqual(result.name, 'Solo nombre');
    assert.strictEqual(result.email, undefined);
    assert.strictEqual(result.phone, undefined);
  });

  it('lanza con null - comportamiento esperado', () => {
    assert.throws(() => parseCorreoSenderData(null), ShippingValidationError);
  });

  it('lanza con array - comportamiento esperado', () => {
    assert.throws(() => parseCorreoSenderData([1,2,3] as any), ShippingValidationError);
  });

  it('lanza sin name - comportamiento esperado', () => {
    assert.throws(() => parseCorreoSenderData({ email: 'test@test.com' } as any), ShippingValidationError);
  });
});