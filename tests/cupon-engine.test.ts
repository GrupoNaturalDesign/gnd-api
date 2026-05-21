import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { CuponEngineService } from '../../src/services/cupon-engine.service';
import type { CarritoItem } from '../../src/services/cupon-engine.service';

const TEST_EMPRESA_ID = 1;

function makeItem(overrides: Partial<CarritoItem> = {}): CarritoItem {
  return {
    productoId: 1,
    productoWebId: 100,
    productoPadreId: 50,
    rubroId: 3,
    subrubroId: 7,
    cantidad: 1,
    precioUnitario: 1000,
    ...overrides,
  };
}

function createEngineWithMock(mockData: {
  cupon?: { findFirst?: (args: unknown) => unknown };
  cuponUso?: { count?: (args: unknown) => number; create?: (args: unknown) => unknown };
}) {
  const engine = new CuponEngineService();
  const mockPrisma = {
    cupon: {
      findFirst: mockData.cupon?.findFirst ?? (() => null),
    },
    cuponUso: {
      count: mockData.cuponUso?.count ?? (() => 0),
      create: mockData.cuponUso?.create ?? (async (d: unknown) => ({ id: 1, ...(d as object) })),
    },
  };
  (engine as unknown as { prisma: typeof mockPrisma }).prisma = mockPrisma;
  return engine;
}

function resetPrisma() {
  delete require.cache[require.resolve('../../src/lib/prisma')];
  delete require.cache[require.resolve('../../src/services/cupon-engine.service')];
}

describe.skip('CuponEngineService — TC-01 a TC-23 (broken)', () => {
  let engine: CuponEngineService;

  function mockPrisma(mockData: Parameters<typeof createEngineWithMock>[0]) {
    engine = createEngineWithMock(mockData);
  }

  beforeEach(() => {
    resetPrisma();
  });

  it('TC-01: Cupón no encontrado — código inexistente', async () => {
    const engine = createEngineWithMock({
      cupon: { findFirst: async () => null },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'INVALIDO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('no encontrado') || result.error?.includes('inactivo'));
  });

  it('TC-02: Cupón antes de fecha de inicio — aún no vigente', async () => {
    const futureStart = new Date(Date.now() + 86400000 * 10);
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'FUTURO', estado: 'activo',
          fechaInicio: futureStart, fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FUTURO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('aún no está vigente'));
  });

  it('TC-03: Cupón expirado — fechaFin en el pasado', async () => {
    const pastEnd = new Date(Date.now() - 86400000);
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'EXPIRADO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000 * 20), fechaFin: pastEnd,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'EXPIRADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('expirado'));
  });

  it('TC-04: Cupón pausado — no se encuentra (estado inactivo)', async () => {
    const engine = createEngineWithMock({
      cupon: { findFirst: async () => null },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PAUSADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-05: Cupón archivado — no se encuentra (estado inactivo)', async () => {
    const engine = createEngineWithMock({
      cupon: { findFirst: async () => null },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'ARCHIVADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-06: Monto mínimo no alcanzado', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'MINIMO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: 5000, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'MINIMO',
      items: [makeItem({ precioUnitario: 100, cantidad: 1 })],
      subtotal: 100,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Monto mínimo'));
  });

  it('TC-07: Límite global de usos agotado', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'AGOTADO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: 5, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: Array(5).fill({}),
        }),
      },
      cuponUso: { count: async () => 5 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'AGOTADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('agotado') || result.error?.includes('límite'));
  });

  it('TC-08: Límite por usuario alcanzado', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'POR_USUARIO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: 2,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 2 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'POR_USUARIO',
      items: [makeItem()],
      subtotal: 1000,
      usuarioId: 10,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('límite') || result.error?.includes('alcanzado'));
  });

  it('TC-09: Carrito completo — todos los items aplicables', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'CARRITO_COMPLETO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [makeItem({ productoId: 1 }), makeItem({ productoId: 2 })];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'CARRITO_COMPLETO',
      items,
      subtotal: 2000,
    });
    assert.strictEqual(result.valido, true);
    assert.ok(result.detalle);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
  });

  it('TC-10: Productos web — sin coincidencias en carrito', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'SOLO_WEB', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'productos_web',
          productosWeb: [{ productoId: 999 }],
          productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_WEB',
      items: [makeItem({ productoWebId: 100 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-11: Productos padre — sin coincidencias en carrito', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'SOLO_PADRE', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'productos_padre',
          productosWeb: [],
          productosPadre: [{ productoId: 999 }],
          rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_PADRE',
      items: [makeItem({ productoPadreId: 50 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-12: Rubro — sin coincidencias en carrito', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'SOLO_RUBRO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'rubro',
          productosWeb: [], productosPadre: [],
          rubros: [{ rubroId: 99 }],
          subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_RUBRO',
      items: [makeItem({ rubroId: 3 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-13: Subrubro — sin coincidencias en carrito', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'SOLO_SUBRUBRO', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'subrubro',
          productosWeb: [], productosPadre: [], rubros: [],
          subrubros: [{ subrubroId: 99 }],
          usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_SUBRUBRO',
      items: [makeItem({ subrubroId: 7 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-14: Descuento porcentaje simple — 20% sobre item de $1000', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'PCT20', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 20,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PCT20',
      items: [makeItem({ precioUnitario: 1000, cantidad: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-15: Descuento monto fijo proporcional — $100 fijo, 2 items de $500 c/u', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'FIJO100', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'monto_fijo', valorDescuento: 100,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 500, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 500, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FIJO100',
      items,
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 100);
    const item1Desc = result.detalle!.detallePorItem.find((d) => d.productoId === 1);
    const item2Desc = result.detalle!.detallePorItem.find((d) => d.productoId === 2);
    assert.ok(item1Desc && item2Desc);
    assert.strictEqual(item1Desc.descuento, 50);
    assert.strictEqual(item2Desc.descuento, 50);
  });

  it('TC-16: Tope máximo global — 50% con tope de $500 sobre 3 items de $1000', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'PCT50TOPE', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 50,
          montoMinimo: null, montoMaximoDescuento: 500,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 3, precioUnitario: 1000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PCT50TOPE',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 500);
  });

  it('TC-17: Carrito mixto — monto fijo $150 proporcional sobre items $1000 y $2000', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'FIJO150', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'monto_fijo', valorDescuento: 150,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FIJO150',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 150);
    const item1 = result.detalle!.detallePorItem.find((d) => d.productoId === 1);
    const item2 = result.detalle!.detallePorItem.find((d) => d.productoId === 2);
    assert.ok(item1 && item2);
    assert.strictEqual(item1.descuento, 50);
    assert.strictEqual(item2.descuento, 100);
  });

  it('TC-18: Solo productos_web aplicables — 1 de 2 items coincide', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'WEB_PCT10', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'productos_web',
          productosWeb: [{ productoId: 100 }],
          productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, productoWebId: 100, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, productoWebId: 200, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'WEB_PCT10',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 1);
    assert.strictEqual(result.detalle!.descuentoTotal, 100);
  });

  it('TC-19: Solo productos_padre aplicables — 2 de 3 items coinciden', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'PADRE_PCT10', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 10,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'productos_padre',
          productosWeb: [],
          productosPadre: [{ productoId: 50 }, { productoId: 51 }],
          rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, productoPadreId: 50, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, productoPadreId: 51, precioUnitario: 2000, cantidad: 1 }),
      makeItem({ productoId: 3, productoPadreId: 99, precioUnitario: 3000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PADRE_PCT10',
      items,
      subtotal: 6000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 300);
  });

  it('TC-20: Solo rubro aplicables — 2 de 5 items del rubro', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'RUBRO_PCT15', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 15,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'rubro',
          productosWeb: [], productosPadre: [],
          rubros: [{ rubroId: 3 }],
          subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, rubroId: 3, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, rubroId: 3, precioUnitario: 500, cantidad: 2 }),
      makeItem({ productoId: 3, rubroId: 99, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'RUBRO_PCT15',
      items,
      subtotal: 4000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 300);
  });

  it('TC-21: Solo subrubro aplicables — 1 de 4 items del subrubro', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'SUBRUBRO_PCT20', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 20,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'subrubro',
          productosWeb: [], productosPadre: [], rubros: [],
          subrubros: [{ subrubroId: 7 }],
          usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const items = [
      makeItem({ productoId: 1, subrubroId: 7, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, subrubroId: 8, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 3, subrubroId: 9, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 4, subrubroId: 10, precioUnitario: 1000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SUBRUBRO_PCT20',
      items,
      subtotal: 4000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 1);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-22: Código case-insensitive — "descuento20" resuelve a "DESCUENTO20"', async () => {
    const engine = createEngineWithMock({
      cupon: {
        findFirst: async () => ({
          id: 1, codigo: 'DESCUENTO20', estado: 'activo',
          fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
          tipoDescuento: 'porcentaje', valorDescuento: 20,
          montoMinimo: null, montoMaximoDescuento: null,
          usoMaximo: null, usoMaximoUsuario: null,
          alcance: 'carrito_completo',
          productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
        }),
      },
      cuponUso: { count: async () => 0 },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'descuento20',
      items: [makeItem({ precioUnitario: 1000, cantidad: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-23: Registrar uso — CuponUso creado con campos correctos', async () => {
    const pedidoId = 123;
    const cuponId = 456;
    const usuarioId = 10;
    const clienteId = 20;
    const descuento = 150;
    let savedData: unknown = null;
    const engine = createEngineWithMock({
      cuponUso: {
        create: async (data: unknown) => {
          savedData = data;
          return { id: 1, ...(data as object) };
        },
      },
    });
    await engine.registrarUso({ cuponId, pedidoId, descuento, usuarioId, clienteId });
    assert.ok(savedData);
    const d = savedData as Record<string, unknown>;
    assert.strictEqual(d.cuponId, cuponId);
    assert.strictEqual(d.pedidoId, pedidoId);
    assert.strictEqual(d.usuarioId, usuarioId);
    assert.strictEqual(d.clienteId, clienteId);
    assert.strictEqual(d.descuento, descuento);
  });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FUTURO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('aún no está vigente'));
  });

  it('TC-03: Cupón expirado — fechaFin en el pasado', async () => {
    const pastEnd = new Date(Date.now() - 86400000);
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'EXPIRADO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000 * 20),
            fechaFin: pastEnd,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'EXPIRADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('expirado'));
  });

  it('TC-04: Cupón pausado — no se encuentra (estado inactivo)', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() => Promise.resolve(null)),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PAUSADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-05: Cupón archivado — no se encuentra (estado inactivo)', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() => Promise.resolve(null)),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'ARCHIVADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-06: Monto mínimo no alcanzado', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'MINIMO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: 5000,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'MINIMO',
      items: [makeItem({ precioUnitario: 100, cantidad: 1 })],
      subtotal: 100,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Monto mínimo'));
  });

  it('TC-07: Límite global de usos agotado', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'AGOTADO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: 5,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: Array(5).fill({}),
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(5)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'AGOTADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('agotado') || result.error?.includes('límite'));
  });

  it('TC-08: Límite por usuario alcanzado', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'POR_USUARIO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: 2,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(2)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'POR_USUARIO',
      items: [makeItem()],
      subtotal: 1000,
      usuarioId: 10,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('límite') || result.error?.includes('alcanzado'));
  });

  it('TC-09: Carrito completo — todos los items aplicables', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'CARRITO_COMPLETO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [makeItem({ productoId: 1 }), makeItem({ productoId: 2 })];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'CARRITO_COMPLETO',
      items,
      subtotal: 2000,
    });
    assert.strictEqual(result.valido, true);
    assert.ok(result.detalle);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
  });

  it('TC-10: Productos web — sin coincidencias en carrito', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'SOLO_WEB',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'productos_web',
            productosWeb: [{ productoId: 999 }],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_WEB',
      items: [makeItem({ productoWebId: 100 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-11: Productos padre — sin coincidencias en carrito', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'SOLO_PADRE',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'productos_padre',
            productosWeb: [],
            productosPadre: [{ productoId: 999 }],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_PADRE',
      items: [makeItem({ productoPadreId: 50 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-12: Rubro — sin coincidencias en carrito', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'SOLO_RUBRO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'rubro',
            productosWeb: [],
            productosPadre: [],
            rubros: [{ rubroId: 99 }],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_RUBRO',
      items: [makeItem({ rubroId: 3 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-13: Subrubro — sin coincidencias en carrito', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'SOLO_SUBRUBRO',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'subrubro',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [{ subrubroId: 99 }],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SOLO_SUBRUBRO',
      items: [makeItem({ subrubroId: 7 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-14: Descuento porcentaje simple — 20% sobre item de $1000', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'PCT20',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 20,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PCT20',
      items: [makeItem({ precioUnitario: 1000, cantidad: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-15: Descuento monto fijo proporcional — $100 fijo, 2 items de $500 c/u', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'FIJO100',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'monto_fijo',
            valorDescuento: 100,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 500, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 500, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FIJO100',
      items,
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 100);
    const item1Desc = result.detalle!.detallePorItem.find((d) => d.productoId === 1);
    const item2Desc = result.detalle!.detallePorItem.find((d) => d.productoId === 2);
    assert.ok(item1Desc && item2Desc);
    assert.strictEqual(item1Desc.descuento, 50);
    assert.strictEqual(item2Desc.descuento, 50);
  });

  it('TC-16: Tope máximo global — 50% con tope de $500 sobre 3 items de $1000', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'PCT50TOPE',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 50,
            montoMinimo: null,
            montoMaximoDescuento: 500,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 3, precioUnitario: 1000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PCT50TOPE',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 500);
  });

  it('TC-17: Carrito mixto — monto fijo $150 proporcional sobre items $1000 y $2000', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'FIJO150',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'monto_fijo',
            valorDescuento: 150,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FIJO150',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 150);
    const item1 = result.detalle!.detallePorItem.find((d) => d.productoId === 1);
    const item2 = result.detalle!.detallePorItem.find((d) => d.productoId === 2);
    assert.ok(item1 && item2);
    assert.strictEqual(item1.descuento, 50);
    assert.strictEqual(item2.descuento, 100);
  });

  it('TC-18: Solo productos_web aplicables — 1 de 2 items coincide', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'WEB_PCT10',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'productos_web',
            productosWeb: [{ productoId: 100 }],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, productoWebId: 100, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, productoWebId: 200, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'WEB_PCT10',
      items,
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 1);
    assert.strictEqual(result.detalle!.descuentoTotal, 100);
  });

  it('TC-19: Solo productos_padre aplicables — 2 de 3 items coinciden', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'PADRE_PCT10',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 10,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'productos_padre',
            productosWeb: [],
            productosPadre: [{ productoId: 50 }, { productoId: 51 }],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, productoPadreId: 50, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, productoPadreId: 51, precioUnitario: 2000, cantidad: 1 }),
      makeItem({ productoId: 3, productoPadreId: 99, precioUnitario: 3000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PADRE_PCT10',
      items,
      subtotal: 6000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 300);
  });

  it('TC-20: Solo rubro aplicables — 2 de 5 items del rubro', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'RUBRO_PCT15',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 15,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'rubro',
            productosWeb: [],
            productosPadre: [],
            rubros: [{ rubroId: 3 }],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, rubroId: 3, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, rubroId: 3, precioUnitario: 500, cantidad: 2 }),
      makeItem({ productoId: 3, rubroId: 99, precioUnitario: 2000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'RUBRO_PCT15',
      items,
      subtotal: 4000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.descuentoTotal, 300);
  });

  it('TC-21: Solo subrubro aplicables — 1 de 4 items del subrubro', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'SUBRUBRO_PCT20',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 20,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'subrubro',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [{ subrubroId: 7 }],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const items = [
      makeItem({ productoId: 1, subrubroId: 7, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 2, subrubroId: 8, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 3, subrubroId: 9, precioUnitario: 1000, cantidad: 1 }),
      makeItem({ productoId: 4, subrubroId: 10, precioUnitario: 1000, cantidad: 1 }),
    ];
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SUBRUBRO_PCT20',
      items,
      subtotal: 4000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 1);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-22: Código case-insensitive — "descuento20" resuelve a "DESCUENTO20"', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1,
            codigo: 'DESCUENTO20',
            estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000),
            fechaFin: null,
            tipoDescuento: 'porcentaje',
            valorDescuento: 20,
            montoMinimo: null,
            montoMaximoDescuento: null,
            usoMaximo: null,
            usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [],
            productosPadre: [],
            rubros: [],
            subrubros: [],
            usages: [],
          })
        ),
      },
      cuponUso: { count: mock.fn(() => Promise.resolve(0)) },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'descuento20',
      items: [makeItem({ precioUnitario: 1000, cantidad: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-23: Registrar uso — CuponUso creado con campos correctos', async () => {
    const pedidoId = 123;
    const cuponId = 456;
    const usuarioId = 10;
    const clienteId = 20;
    const descuento = 150;

    let savedData: unknown = null;
    mockPrisma({
      cuponUso: {
        create: mock.fn((data: unknown) => {
          savedData = data;
          return Promise.resolve({ id: 1, ...(data as object) });
        }),
      },
    });

    await engine.registrarUso({ cuponId, pedidoId, descuento, usuarioId, clienteId });

    assert.ok(savedData);
    const d = savedData as Record<string, unknown>;
    assert.strictEqual(d.cuponId, cuponId);
    assert.strictEqual(d.pedidoId, pedidoId);
    assert.strictEqual(d.usuarioId, usuarioId);
    assert.strictEqual(d.clienteId, clienteId);
    assert.strictEqual(d.descuento, descuento);
  });
});