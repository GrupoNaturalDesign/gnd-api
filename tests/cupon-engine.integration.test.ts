import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getTestPrisma, createTestCupon, createTestPedido } from '../helpers/setup';
import { CuponEngineService } from '../../src/services/cupon-engine.service';

const TEST_EMPRESA_ID = 1;
const prisma = getTestPrisma();
const engine = new CuponEngineService();

describe('CuponEngineService — Integration Tests (IT-01 a IT-05)', { concurrency: false }, () => {
  before(async () => {
    await prisma.pedido.deleteMany({ where: { empresaId: TEST_EMPRESA_ID } });
    await prisma.cuponUso.deleteMany({ where: { cupon: { empresaId: TEST_EMPRESA_ID } } });
    await prisma.cupon.deleteMany({
      where: { empresaId: TEST_EMPRESA_ID, codigo: { startsWith: 'TEST_' } },
    });
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('IT-01: Crear cupón + validar + usar — flujo completo', async () => {
    const cupon = await createTestCupon({
      codigo: 'TEST_IT01',
      tipoDescuento: 'porcentaje',
      valorDescuento: 10,
      alcance: 'carrito_completo',
    });

    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TEST_IT01',
      items: [
        { productoId: 1, productoWebId: 1, cantidad: 1, precioUnitario: 1000 },
      ],
      subtotal: 1000,
    });

    assert.strictEqual(result.valido, true);
    assert.ok(result.detalle);
    assert.strictEqual(result.detalle!.descuentoTotal, 100);

    await engine.registrarUso({
      cuponId: cupon.id,
      pedidoId: 1,
      descuento: 100,
    });

    const count = await prisma.cuponUso.count({ where: { cuponId: cupon.id } });
    assert.strictEqual(count, 1);
  });

  it('IT-02: Uso registra correctamente — campos en CuponUso', async () => {
    const cupon = await createTestCupon({
      codigo: 'TEST_IT02',
      tipoDescuento: 'porcentaje',
      valorDescuento: 15,
      alcance: 'carrito_completo',
    });
    const pedido = await createTestPedido({ clienteEmail: 'it02@test.com' });

    await engine.registrarUso({
      cuponId: cupon.id,
      pedidoId: pedido.id,
      descuento: 300,
      usuarioId: 5,
      clienteId: 10,
    });

    const uso = await prisma.cuponUso.findFirst({ where: { cuponId: cupon.id, pedidoId: pedido.id } });
    assert.ok(uso);
    assert.strictEqual(uso.descuento, 300);
    assert.strictEqual(uso.usuarioId, 5);
    assert.strictEqual(uso.clienteId, 10);
  });

  it('IT-03: Límite global se controla en tiempo real — 2 usos de 2 máximo', async () => {
    const cupon = await createTestCupon({
      codigo: 'TEST_IT03',
      tipoDescuento: 'porcentaje',
      valorDescuento: 20,
      alcance: 'carrito_completo',
      usoMaximo: 2,
    });

    await engine.registrarUso({ cuponId: cupon.id, pedidoId: 1, descuento: 200 });
    await engine.registrarUso({ cuponId: cupon.id, pedidoId: 2, descuento: 200 });

    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TEST_IT03',
      items: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }],
      subtotal: 1000,
    });

    assert.strictEqual(result.valido, false);
    assert.ok(result.error?.includes('agotado') || result.error?.includes('límite'));
  });

  it('IT-04: Límite por usuario se controla en tiempo real — 2 usuarios distintos', async () => {
    const cupon = await createTestCupon({
      codigo: 'TEST_IT04',
      tipoDescuento: 'porcentaje',
      valorDescuento: 25,
      alcance: 'carrito_completo',
      usoMaximoUsuario: 1,
    });

    await engine.registrarUso({
      cuponId: cupon.id,
      pedidoId: 1,
      descuento: 250,
      usuarioId: 100,
    });

    const result = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TEST_IT04',
      items: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }],
      subtotal: 1000,
      usuarioId: 100,
    });
    assert.strictEqual(result.valido, false);

    const result2 = await engine.validarCupon({
      empresaId: TEST_EMPRESA_ID,
      codigo: 'TEST_IT04',
      items: [{ productoId: 1, cantidad: 1, precioUnitario: 1000 }],
      subtotal: 1000,
      usuarioId: 200,
    });
    assert.strictEqual(result2.valido, true);
  });

  it('IT-05: aplicarCuponAPedido persiste correctamente — snapshot en Pedido', async () => {
    const cupon = await createTestCupon({
      codigo: 'TEST_IT05',
      tipoDescuento: 'porcentaje',
      valorDescuento: 30,
      alcance: 'carrito_completo',
    });
    const pedido = await createTestPedido({});

    await engine.aplicarCuponAPedido(pedido.id, {
      cuponId: cupon.id,
      codigo: 'TEST_IT05',
      nombre: 'Cupón test IT-05',
      tipoDescuento: 'porcentaje',
      valorDescuento: 30,
      alcance: 'carrito_completo',
      descuentoTotal: 300,
      itemsAplicados: 1,
      detallePorItem: [
        { productoId: 1, cantidad: 1, precioOriginal: 1000, descuento: 300, precioFinal: 700 },
      ],
    });

    const updated = await prisma.pedido.findUnique({ where: { id: pedido.id } });
    assert.ok(updated);
    assert.strictEqual(updated.cuponId, cupon.id);
    assert.strictEqual(updated.cuponCodigoSnapshot, 'TEST_IT05');
    assert.strictEqual(Number(updated.cuponDescuentoTotal), 300);
  });
});