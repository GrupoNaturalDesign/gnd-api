import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildCheckoutStructuredAddress,
  buildClienteDireccionFromAddress,
  formatClienteDireccionLine,
  normalizeFacturaFields,
} from '../../src/utils/checkout-address.util';

describe('checkout-address.util', () => {
  it('formatClienteDireccionLine incluye piso, depto, barrio y lote', () => {
    const line = formatClienteDireccionLine({
      streetName: 'Av. Colón',
      streetNumber: '100',
      city: 'Córdoba',
      state: 'Córdoba',
      zipCode: '5000',
      floor: '3',
      department: 'B',
      barrio: 'Centro',
      loteManzana: '5-12',
    });
    assert.ok(line.includes('Piso 3'));
    assert.ok(line.includes('Depto B'));
    assert.ok(line.includes('Barrio Centro'));
    assert.ok(line.includes('Lote/Mz 5-12'));
  });

  it('buildCheckoutStructuredAddress desde campos desglosados', () => {
    const addr = buildCheckoutStructuredAddress({
      calle: 'San Martín',
      numero: '250',
      localidad: 'Córdoba',
      provincia: 'Córdoba',
      codigo_postal: '5000',
      piso: '1',
      depto: 'A',
    });
    assert.ok(addr);
    assert.strictEqual(addr!.streetNumber, '250');
    assert.strictEqual(buildClienteDireccionFromAddress(addr!), formatClienteDireccionLine(addr!));
  });

  it('normalizeFacturaFields limpia cuando no necesita factura', () => {
    const f = normalizeFacturaFields({ necesitaFactura: false, facturaTipo: 'A' });
    assert.strictEqual(f.necesitaFactura, false);
    assert.strictEqual(f.facturaTipo, null);
  });

  it('normalizeFacturaFields persiste A/C con datos', () => {
    const f = normalizeFacturaFields({
      necesitaFactura: true,
      facturaTipo: 'A',
      facturaCuit: ' 20-12345678-9 ',
      facturaRazonSocial: ' ACME SA ',
    });
    assert.strictEqual(f.facturaTipo, 'A');
    assert.strictEqual(f.facturaCuit, '20-12345678-9');
    assert.strictEqual(f.facturaRazonSocial, 'ACME SA');
  });
});
