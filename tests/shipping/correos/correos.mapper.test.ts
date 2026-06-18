import { beforeEach } from 'node:test';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { ShippingAgency } from '../../../src/services/shipping/shipping.types';
import {
  parseCorreoSenderData,
  mapCreateOrderToMicorreoImport,
  mapRatesResponse,
  mapCorreoTrackingResponseToResults,
  mapCorreoAgenciesResponse,
  filterAgenciesByQuery,
  buildRatesRequestBody,
} from '../../../src/services/shipping/correo/correo.mapper';
import { getProvinceCode } from '../../../src/services/shipping/correo/correo.types';

const testOrigin = { postalCode: '5000', provinceCode: 'X' };

describe('SH-C-02 — getProvinceCode', () => {
  it('resuelve nombre completo "Córdoba"', () => {
    assert.strictEqual(getProvinceCode('Córdoba'), 'X');
  });
  it('resuelve nombre completo "Provincia de Buenos Aires"', () => {
    assert.strictEqual(getProvinceCode('Provincia de Buenos Aires'), 'B');
  });
  it('resuelve nombre completo "CABA"', () => {
    assert.strictEqual(getProvinceCode('CABA'), 'C');
  });
  it('resuelve nombre completo "Tierra del Fuego"', () => {
    assert.strictEqual(getProvinceCode('Tierra del Fuego'), 'V');
  });
  it('resuelve nombre completo "Neuquén"', () => {
    assert.strictEqual(getProvinceCode('Neuquén'), 'Q');
  });
  it('resuelve nombre completo sin tilde "Cordoba"', () => {
    assert.strictEqual(getProvinceCode('Cordoba'), 'X');
  });
  it('resuelve nombre completo "Ciudad Autónoma de Buenos Aires"', () => {
    assert.strictEqual(getProvinceCode('Ciudad Autónoma de Buenos Aires'), 'C');
  });
  it('resuelve código de una letra "B" en mayúscula', () => {
    assert.strictEqual(getProvinceCode('B'), 'B');
  });
  it('resuelve código de una letra "x" en minúscula', () => {
    assert.strictEqual(getProvinceCode('x'), 'X');
  });
  it('devuelve undefined para provincia inexistente', () => {
    assert.strictEqual(getProvinceCode('No Existe'), undefined);
  });
  it('devuelve undefined para string vacío', () => {
    assert.strictEqual(getProvinceCode(''), undefined);
  });
});

describe('SH-C-03 — parseCorreoSenderData', () => {
  it('lanza con null', () => {
    assert.throws(
      () => parseCorreoSenderData(null),
      /correoSenderData debe ser un objeto JSON/
    );
  });
  it('lanza con undefined', () => {
    assert.throws(
      () => parseCorreoSenderData(null),
      /correoSenderData debe ser un objeto JSON/
    );
  });
  it('lanza con array', () => {
    assert.throws(
      () => parseCorreoSenderData([]),
      /correoSenderData debe ser un objeto JSON/
    );
  });
  it('lanza con primitivo', () => {
    assert.throws(
      () => parseCorreoSenderData('string'),
      /correoSenderData debe ser un objeto JSON/
    );
  });
  it('lanza sin campo name', () => {
    assert.throws(
      () => parseCorreoSenderData({ email: 'a@b.com' }),
      /correoSenderData.name es obligatorio/
    );
  });
  it('lanza con name vacío', () => {
    assert.throws(
      () => parseCorreoSenderData({ name: '   ' }),
      /correoSenderData.name es obligatorio/
    );
  });
  it('ok con solo name', () => {
    const result = parseCorreoSenderData({ name: 'Test Sender' });
    assert.strictEqual(result.name, 'Test Sender');
    assert.strictEqual(result.email, undefined);
    assert.strictEqual(result.phone, undefined);
  });
  it('ok con todos los campos requeridos', () => {
    const result = parseCorreoSenderData({
      name: 'Sender Test',
      email: 'sender@test.com',
      phone: '+5493510000000',
      streetName: 'Calle Falsa',
      streetNumber: '123',
      city: 'Córdoba',
    });
    assert.strictEqual(result.name, 'Sender Test');
    assert.strictEqual(result.email, 'sender@test.com');
    assert.strictEqual(result.phone, '+5493510000000');
    assert.strictEqual(result.streetName, 'Calle Falsa');
    assert.strictEqual(result.streetNumber, '123');
    assert.strictEqual(result.city, 'Córdoba');
  });
  it('ignora campos desconocidos', () => {
    const result = parseCorreoSenderData({ name: 'Test', foo: 'bar', baz: 123 });
    assert.strictEqual(result.name, 'Test');
    assert.strictEqual((result as unknown as Record<string, unknown>)['foo'], undefined);
  });
});

describe('SH-C-04 — mapCreateOrderToMicorreoImport', () => {
  it('domicilio tiene senderAddress, sin agencyId', () => {
    const input = buildOrderInput({ deliveryType: 'homeDelivery' });
    const result = mapCreateOrderToMicorreoImport(input, 'CUST123', { name: 'Sender' }, testOrigin);
    assert.strictEqual(result.shipping.deliveryType, 'D');
    assert.ok(result.shipping.address);
    assert.strictEqual((result.shipping as Record<string, unknown>).agency, undefined);
  });

  it('sucursal tiene agencyId, sin senderAddress', () => {
    const input = buildOrderInput({ deliveryType: 'agency', agencyId: 'SUC-001' });
    const result = mapCreateOrderToMicorreoImport(input, 'CUST123', { name: 'Sender' }, testOrigin);
    assert.strictEqual(result.shipping.deliveryType, 'S');
    assert.strictEqual((result.shipping as Record<string, unknown>).address, undefined);
    assert.strictEqual((result.shipping as Record<string, unknown>).agency, 'SUC-001');
  });

  it('domicilio sin address lanza', () => {
    const input = buildOrderInput({ deliveryType: 'homeDelivery', omitAddress: true });
    assert.throws(
      () => mapCreateOrderToMicorreoImport(input, 'CUST123', { name: 'Sender' }, testOrigin),
      /address es obligatorio/
    );
  });

  it('sucursal sin agencyId lanza', () => {
    const input = buildOrderInput({ deliveryType: 'agency', omitAgencyId: true });
    assert.throws(
      () => mapCreateOrderToMicorreoImport(input, 'CUST123', { name: 'Sender' }, testOrigin),
      /agencyId es obligatorio/
    );
  });

  it('extOrderId override funciona', () => {
    const input = buildOrderInput({ deliveryType: 'homeDelivery' });
    const result = mapCreateOrderToMicorreoImport(input, 'CUST123', { name: 'Sender' }, testOrigin, { extOrderId: 'TEST-999' });
    assert.strictEqual(result.extOrderId, 'TEST-999');
  });

  it('senderData null lanza', () => {
    const input = buildOrderInput({ deliveryType: 'homeDelivery' });
    assert.throws(
      () => mapCreateOrderToMicorreoImport(input, 'CUST123', null, testOrigin),
      /correoSenderData debe ser un objeto JSON/
    );
  });

  it('senderData sin name lanza', () => {
    const input = buildOrderInput({ deliveryType: 'homeDelivery' });
    assert.throws(
      () => mapCreateOrderToMicorreoImport(input, 'CUST123', { email: 'a@b.com' } as unknown as import('@prisma/client').Prisma.JsonValue, testOrigin),
      /correoSenderData.name es obligatorio/
    );
  });
});

describe('SH-C-05 — mapRatesResponse', () => {
  it('parsea respuesta con rates en array', () => {
    const data = {
      rates: [
        { serviceCode: 'CP', serviceName: 'Correo Argentino', price: 1500, currency: 'ARS' },
        { serviceCode: 'EP', serviceName: 'Express', price: 2500, currency: 'ARS' },
      ],
    };
    const result = mapRatesResponse(data);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]!.serviceCode, 'CP');
    assert.strictEqual(result[0]!.price, 1500);
    assert.strictEqual(result[1]!.serviceCode, 'EP');
    assert.strictEqual(result[1]!.price, 2500);
  });

  it('parsea respuesta con data en wrapper', () => {
    const data = {
      data: [
        { serviceCode: 'CP', serviceName: 'Standard', price: 1000, currency: 'ARS' },
      ],
    };
    const result = mapRatesResponse(data);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.price, 1000);
  });

  it('soporta price en campo amount', () => {
    const data = { rates: [{ serviceCode: 'CP', serviceName: 'Test', amount: 999.5 }] };
    const result = mapRatesResponse(data);
    assert.strictEqual(result[0]!.price, 999.5);
  });

  it('soporta price en campo total', () => {
    const data = { rates: [{ serviceCode: 'EP', serviceName: 'Express', total: 3500 }] };
    const result = mapRatesResponse(data);
    assert.strictEqual(result[0]!.price, 3500);
  });

  it('ignora rates con price inválido', () => {
    const data = {
      rates: [
        { serviceCode: 'CP', serviceName: 'Valid', price: 1000 },
        { serviceCode: 'INVALID', serviceName: 'NoPrice', price: 'not-a-number' },
        { serviceCode: 'ALSO_VALID', serviceName: 'ZeroPrice', price: 0 },
      ],
    };
    const result = mapRatesResponse(data);
    assert.strictEqual(result.length, 2);
  });

  it('devuelve array vacío para null', () => {
    assert.deepStrictEqual(mapRatesResponse(null), []);
  });

  it('devuelve array vacío para respuesta sin rates', () => {
    assert.deepStrictEqual(mapRatesResponse({ other: 'field' }), []);
  });

  it('devuelve array vacío para rates que no es array', () => {
    assert.deepStrictEqual(mapRatesResponse({ rates: 'not-an-array' }), []);
  });
});

describe('SH-C-06 — mapCorreoTrackingResponseToResults', () => {
  it('parsea respuesta con eventos en array simple', () => {
    const data = [
      { status_id: 'S1', status: 'Enviado', date: '2025-01-01', facility: 'Córdoba' },
      { status_id: 'S2', status: 'En camino', date: '2025-01-02', facility: 'BsAs' },
    ];
    const result = mapCorreoTrackingResponseToResults(data, ['TN123']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.trackingNumber, 'TN123');
    assert.strictEqual(result[0]!.events.length, 2);
    assert.strictEqual(result[0]!.events[0]!.status, 'Enviado');
  });

  it('parsea respuesta con wrapper events', () => {
    const data = {
      trackingNumber: 'TN456',
      events: [
        { status: 'Recibido', date: '2025-01-10', facility: 'Depósito' },
      ],
    };
    const result = mapCorreoTrackingResponseToResults(data, ['TN456']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.trackingNumber, 'TN456');
    assert.strictEqual(result[0]!.events[0]!.status, 'Recibido');
  });

  it('devuelve fallback con tracking vacío', () => {
    const result = mapCorreoTrackingResponseToResults(null, []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.events.length, 0);
  });

  it('devuelve fallback para error flag', () => {
    const data = { error: 'No encontrado' };
    const result = mapCorreoTrackingResponseToResults(data, ['TN789']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.trackingNumber, 'TN789');
    assert.strictEqual(result[0]!.events.length, 0);
  });

  it('soporta eventos en campo history', () => {
    const data = {
      history: [
        { status: 'Entregado', date: '2025-01-15' },
      ],
    };
    const result = mapCorreoTrackingResponseToResults(data, ['TN100']);
    assert.strictEqual(result[0]!.events.length, 1);
    assert.strictEqual(result[0]!.events[0]!.status, 'Entregado');
  });

  it('soporta eventos en campo eventos', () => {
    const data = {
      eventos: [
        { status: 'En tránsito', date: '2025-01-12', facility: 'Rosario' },
      ],
    };
    const result = mapCorreoTrackingResponseToResults(data, ['TN200']);
    assert.strictEqual(result[0]!.events[0]!.status, 'En tránsito');
  });
});

describe('SH-C-05 — filterAgenciesByQuery', () => {
  const agencies: ShippingAgency[] = [
    { agencyId: '1', name: 'Sucursal CBA', address: '', city: 'Córdoba', state: 'X', zipCode: '5000', schedule: '', phone: '', email: '', latitude: '', longitude: '', pickupAvailability: true, packageReception: true },
    { agencyId: '2', name: 'Sucursal ROS', address: '', city: 'Rosario', state: 'S', zipCode: '2000', schedule: '', phone: '', email: '', latitude: '', longitude: '', pickupAvailability: false, packageReception: true },
    { agencyId: '3', name: 'Sucursal BSAS', address: '', city: 'Buenos Aires', state: 'B', zipCode: '1000', schedule: '', phone: '', email: '', latitude: '', longitude: '', pickupAvailability: true, packageReception: false },
  ];

  it('filtra por estado', () => {
    const result = filterAgenciesByQuery(agencies, { stateId: 'X' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.agencyId, '1');
  });

  it('filtra por nombre de provincia', () => {
    const result = filterAgenciesByQuery(agencies, { stateId: 'Córdoba' });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.agencyId, '1');
  });

  it('filtra por pickupAvailability', () => {
    const result = filterAgenciesByQuery(agencies, { pickupAvailability: true });
    assert.strictEqual(result.length, 2);
  });

  it('filtra por packageReception', () => {
    const result = filterAgenciesByQuery(agencies, { packageReception: true });
    assert.strictEqual(result.length, 2);
  });

  it('combina filtros', () => {
    const result = filterAgenciesByQuery(agencies, { stateId: 'X', pickupAvailability: true });
    assert.strictEqual(result.length, 1);
  });

  it('sin filtros devuelve todas', () => {
    const result = filterAgenciesByQuery(agencies, {});
    assert.strictEqual(result.length, 3);
  });
});

function buildOrderInput(overrides: {
  deliveryType: 'homeDelivery' | 'agency';
  agencyId?: string;
  omitAddress?: boolean;
  omitAgencyId?: boolean;
}): import('../../../src/services/shipping/shipping.types').CreateShippingOrderInput {
  const base = {
    pedidoId: 1,
    empresaId: 1,
    recipient: { name: 'Test', email: 'test@test.com', phone: '3510000000' },
    parcel: { weightGrams: 500, height: 10, width: 15, depth: 20, declaredValue: 1000 },
  };
  if (overrides.deliveryType === 'homeDelivery') {
    if (overrides.omitAddress) {
      return {
        ...base,
        deliveryType: 'homeDelivery',
      } as import('../../../src/services/shipping/shipping.types').CreateShippingOrderInput;
    }
    return {
      ...base,
      deliveryType: 'homeDelivery',
      address: {
        streetName: 'Calle Falsa',
        streetNumber: '123',
        city: 'Córdoba',
        state: 'Córdoba',
        zipCode: '5000',
      },
    } as import('../../../src/services/shipping/shipping.types').CreateShippingOrderInput;
  }
  return {
    ...base,
    deliveryType: 'agency',
    agencyId: overrides.omitAgencyId ? undefined : (overrides.agencyId ?? 'SUC-001'),
  } as import('../../../src/services/shipping/shipping.types').CreateShippingOrderInput;
}