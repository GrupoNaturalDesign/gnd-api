import dotenv from 'dotenv';
import { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { getMariaPoolConfig } from '../../src/lib/db-config';

dotenv.config();

let _adapter: PrismaMariaDb | null = null;
let _client: PrismaClient | null = null;

function getTestAdapter(): PrismaMariaDb {
  if (!_adapter) {
    _adapter = new PrismaMariaDb(getMariaPoolConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]);
  }
  return _adapter;
}

export function getTestPrisma(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      adapter: getTestAdapter(),
      log: ['error'],
    });
  }
  return _client;
}

const prisma = getTestPrisma();

const TEST_EMPRESA_ID = 1;

const createdCuponIds: number[] = [];
const createdPedidoIds: number[] = [];

export async function createTestCupon(data: {
  codigo?: string;
  nombre?: string;
  tipoDescuento?: 'porcentaje' | 'monto_fijo';
  valorDescuento?: number;
  alcance?: 'carrito_completo' | 'productos_web' | 'productos_padre' | 'rubro' | 'subrubro';
  estado?: 'activo' | 'pausado' | 'archivado';
  montoMinimo?: number | null;
  montoMaximoDescuento?: number | null;
  usoMaximo?: number | null;
  usoMaximoUsuario?: number | null;
  fechaInicio?: Date;
  fechaFin?: Date | null;
  productosWeb?: number[];
  productosPadre?: number[];
  rubros?: number[];
  subrubros?: number[];
}) {
  const cupon = await prisma.cupon.create({
    data: {
      empresaId: TEST_EMPRESA_ID,
      codigo: (data.codigo ?? `TEST_${Date.now()}`).toUpperCase(),
      nombre: data.nombre ?? 'Cupón de test',
      tipoDescuento: data.tipoDescuento ?? 'porcentaje',
      valorDescuento: data.valorDescuento ?? 10,
      alcance: data.alcance ?? 'carrito_completo',
      estado: data.estado ?? 'activo',
      montoMinimo: data.montoMinimo ?? null,
      montoMaximoDescuento: data.montoMaximoDescuento ?? null,
      usoMaximo: data.usoMaximo ?? null,
      usoMaximoUsuario: data.usoMaximoUsuario ?? null,
      fechaInicio: data.fechaInicio ?? new Date(Date.now() - 86400000),
      fechaFin: data.fechaFin ?? null,
      productosWeb: data.productosWeb?.length
        ? { create: data.productosWeb.map((p) => ({ productoId: p })) }
        : undefined,
      productosPadre: data.productosPadre?.length
        ? { create: data.productosPadre.map((p) => ({ productoId: p })) }
        : undefined,
      rubros: data.rubros?.length
        ? { create: data.rubros.map((r) => ({ rubroId: r })) }
        : undefined,
      subrubros: data.subrubros?.length
        ? { create: data.subrubros.map((s) => ({ subrubroId: s })) }
        : undefined,
    },
  });
  createdCuponIds.push(cupon.id);
  return cupon;
}

export async function createTestPedido(data: {
  usuarioId?: number;
  clienteId?: number;
  clienteEmail?: string;
  clienteNombre?: string;
  cuponId?: number;
}) {
  const pedido = await prisma.pedido.create({
    data: {
      empresaId: TEST_EMPRESA_ID,
      usuarioId: data.usuarioId ?? null,
      clienteId: data.clienteId ?? null,
      clienteEmail: data.clienteEmail ?? `test_${Date.now()}@test.com`,
      clienteNombre: data.clienteNombre ?? 'Test User',
      subtotal: 1000,
      iva: 210,
      total: 1210,
      estadoInterno: 'carrito',
      cuponId: data.cuponId ?? null,
    },
  });
  createdPedidoIds.push(pedido.id);
  return pedido;
}

export async function cleanupTestData() {
  await prisma.$transaction([
    prisma.cuponUso.deleteMany({ where: { cuponId: { in: createdCuponIds } } }),
    ...(createdPedidoIds.length > 0
      ? [prisma.pedido.deleteMany({ where: { id: { in: createdPedidoIds } } })]
      : []),
    prisma.cupon.deleteMany({ where: { id: { in: createdCuponIds } } }),
  ]);
}

export function registerCleanup(
  suite: { beforeEach: (fn: () => void | Promise<void>) => void },
  prismaClient: PrismaClient
) {
  suite.beforeEach(async () => {
    await prismaClient.pedido.deleteMany({ where: { empresaId: TEST_EMPRESA_ID } });
    await prismaClient.cuponUso.deleteMany({
      where: { cupon: { empresaId: TEST_EMPRESA_ID } },
    });
    await prismaClient.cupon.deleteMany({
      where: { empresaId: TEST_EMPRESA_ID, codigo: { startsWith: 'TEST_' } },
    });
  });
}

export { createdCuponIds, createdPedidoIds, prisma, TEST_EMPRESA_ID };