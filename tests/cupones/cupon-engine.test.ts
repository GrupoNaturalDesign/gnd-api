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

describe('CuponEngineService — TC-01 a TC-23', () => {
  let engine: CuponEngineService;

  function mockPrisma(mockData: {
    cupon?: { findFirst?: (...args: unknown[]) => unknown };
    cuponUso?: { count?: (...args: unknown[]) => unknown; create?: (...args: unknown[]) => unknown };
  }) {
    engine = new CuponEngineService();
    const mockPrismaClient = {
      cupon: {
        findFirst: mockData.cupon?.findFirst ?? (() => Promise.resolve(null)),
      },
      cuponUso: {
        count: mockData.cuponUso?.count ?? (() => Promise.resolve(0)),
        create: mockData.cuponUso?.create ?? (async (d: unknown) => ({ id: 1, ...(d as object) })),
      },
    };
    (engine as unknown as { prisma: typeof mockPrismaClient }).prisma = mockPrismaClient;
  }

  beforeEach(() => {
    mockPrisma({});
  });

  it('TC-01: Cupón no encontrado — código inexistente', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() => Promise.resolve(null)),
      },
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
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'FUTURO', estado: 'activo',
            fechaInicio: futureStart, fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
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
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'EXPIRADO', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000 * 20), fechaFin: pastEnd,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
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
            id: 1, codigo: 'MINIMO', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: 5000, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'MINIMO',
      items: [makeItem({ precioUnitario: 1000 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Monto mínimo'));
  });

  it('TC-07: Uso máximo global alcanzado', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'AGOTADO', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: 5, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [],
            usages: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
          })
        ),
      },
      cuponUso: {
        count: mock.fn(() => Promise.resolve(5)),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'AGOTADO',
      items: [makeItem()],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('agotado'));
  });

  it('TC-08: Uso máximo por usuario alcanzado', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'LIMITE_USER', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: 1,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [],
            usages: [{ id: 1, usuarioId: 42 }],
          })
        ),
      },
      cuponUso: {
        count: mock.fn(() => Promise.resolve(1)),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'LIMITE_USER',
      items: [makeItem()],
      subtotal: 1000,
      usuarioId: 42,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('límite') || result.error?.includes('usado'));
  });

  it('TC-09: Alcance carrito completo — todos los items aplican', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'TOTAL', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TOTAL',
      items: [makeItem({ productoWebId: 1 }), makeItem({ productoWebId: 2 })],
      subtotal: 2000,
    });
    assert.strictEqual(result.valido, true);
  });

  it('TC-10: Alcance productos_web sin match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'WEB', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'productos_web',
            productosWeb: [{ productoId: 999 }], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'WEB',
      items: [makeItem({ productoWebId: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('Ningún producto'));
  });

  it('TC-11: Alcance productos_padre sin match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'PADRE', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'productos_padre',
            productosWeb: [], productosPadre: [{ productoId: 999 }], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PADRE',
      items: [makeItem({ productoPadreId: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-12: Alcance rubro sin match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'RUBRO', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'rubro',
            productosWeb: [], productosPadre: [], rubros: [{ rubroId: 999 }], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'RUBRO',
      items: [makeItem({ rubroId: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-13: Alcance subrubro sin match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'SUBRUBRO', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'subrubro',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [{ subrubroId: 999 }], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SUBRUBRO',
      items: [makeItem({ subrubroId: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, false);
  });

  it('TC-14: Descuento porcentaje sobre carrito completo', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'DCTO20', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 20,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'DCTO20',
      items: [makeItem({ precioUnitario: 1000, cantidad: 1 })],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 200);
  });

  it('TC-15: Descuento monto fijo repartido proporcionalmente', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'FIJO100', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'monto_fijo', valorDescuento: 100,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'FIJO100',
      items: [
        makeItem({ productoWebId: 1, precioUnitario: 500, cantidad: 1 }),
        makeItem({ productoWebId: 2, precioUnitario: 500, cantidad: 1 }),
      ],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.itemsAplicados, 2);
    assert.strictEqual(result.detalle!.detallePorItem[0]!.descuento, 50);
    assert.strictEqual(result.detalle!.detallePorItem[1]!.descuento, 50);
  });

  it('TC-16: Tope máximo de descuento global', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'TOPE500', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 50,
            montoMinimo: null, montoMaximoDescuento: 500,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TOPE500',
      items: [
        makeItem({ productoWebId: 1, precioUnitario: 1000, cantidad: 1 }),
        makeItem({ productoWebId: 2, precioUnitario: 1000, cantidad: 1 }),
        makeItem({ productoWebId: 3, precioUnitario: 1000, cantidad: 1 }),
      ],
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.descuentoTotal, 500);
  });

  it('TC-17: Carrito mixto con descuento monto fijo', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'MIX150', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'monto_fijo', valorDescuento: 150,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'MIX150',
      items: [
        makeItem({ productoWebId: 1, precioUnitario: 1000, cantidad: 1 }),
        makeItem({ productoWebId: 2, precioUnitario: 2000, cantidad: 1 }),
      ],
      subtotal: 3000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.detallePorItem.length, 2);
    assert.strictEqual(result.detalle!.detallePorItem[0]!.descuento, 50);
    assert.strictEqual(result.detalle!.detallePorItem[1]!.descuento, 100);
  });

  it('TC-18: Alcance productos_web con match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'WEBOK', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'productos_web',
            productosWeb: [{ productoId: 100 }], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'WEBOK',
      items: [
        makeItem({ productoWebId: 100, precioUnitario: 500 }),
        makeItem({ productoWebId: 200, precioUnitario: 500 }),
      ],
      subtotal: 1000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.detallePorItem.length, 1);
  });

  it('TC-19: Alcance productos_padre con match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'PADREOK', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'productos_padre',
            productosWeb: [], productosPadre: [{ productoId: 50 }], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'PADREOK',
      items: [
        makeItem({ productoPadreId: 50, precioUnitario: 500 }),
        makeItem({ productoPadreId: 50, precioUnitario: 500 }),
        makeItem({ productoPadreId: 999, precioUnitario: 500 }),
      ],
      subtotal: 1500,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.detallePorItem.length, 2);
  });

  it('TC-20: Alcance rubro con match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'RUBROOK', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'rubro',
            productosWeb: [], productosPadre: [], rubros: [{ rubroId: 3 }], subrubros: [], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'RUBROOK',
      items: [
        makeItem({ rubroId: 3, precioUnitario: 500 }),
        makeItem({ rubroId: 3, precioUnitario: 500 }),
        makeItem({ rubroId: 999, precioUnitario: 500 }),
        makeItem({ rubroId: 888, precioUnitario: 500 }),
        makeItem({ rubroId: 777, precioUnitario: 500 }),
      ],
      subtotal: 2500,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.detallePorItem.length, 2);
  });

  it('TC-21: Alcance subrubro con match', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'SUBOK', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 10,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'subrubro',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [{ subrubroId: 7 }], usages: [],
          })
        ),
      },
    });
    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'SUBOK',
      items: [
        makeItem({ subrubroId: 7, precioUnitario: 500 }),
        makeItem({ subrubroId: 999, precioUnitario: 500 }),
        makeItem({ subrubroId: 888, precioUnitario: 500 }),
        makeItem({ subrubroId: 777, precioUnitario: 500 }),
      ],
      subtotal: 2000,
    });
    assert.strictEqual(result.valido, true);
    assert.strictEqual(result.detalle!.detallePorItem.length, 1);
  });

  it('TC-22: Case insensitive — código en mayúsculas se busca correctamente', async () => {
    mockPrisma({
      cupon: {
        findFirst: mock.fn(() =>
          Promise.resolve({
            id: 1, codigo: 'DESCUENTO20', estado: 'activo',
            fechaInicio: new Date(Date.now() - 86400000), fechaFin: null,
            tipoDescuento: 'porcentaje', valorDescuento: 20,
            montoMinimo: null, montoMaximoDescuento: null,
            usoMaximo: null, usoMaximoUsuario: null,
            alcance: 'carrito_completo',
            productosWeb: [], productosPadre: [], rubros: [], subrubros: [], usages: [],
          })
        ),
      },
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

    let savedData: Record<string, unknown> | null = null;
    mockPrisma({
      cuponUso: {
        create: mock.fn((args: unknown) => {
          const data = (args as { data: Record<string, unknown> }).data;
          savedData = data;
          return Promise.resolve({ id: 1, ...data });
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
