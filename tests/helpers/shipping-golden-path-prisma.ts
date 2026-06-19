import type { EmpresaEnvioConfig, Pedido, PedidoItem } from '@prisma/client';
import prisma from '../../src/lib/prisma';

type PedidoWithItems = Pedido & { items?: PedidoItem[] };

export type GoldenPathPrismaState = {
  pedidos: Map<number, PedidoWithItems>;
  envioConfigByEmpresa: Map<number, EmpresaEnvioConfig>;
  productoWebRows: Array<{ id: number; sfactoryCodigo: string }>;
  productoSfactoryRows: Array<{
    codigo: string;
    peso_bruto: unknown;
    ancho: unknown;
    largo: unknown;
    subrubro: string | null;
  }>;
  envioLogs: unknown[];
  pedidoUpdates: Array<{ id: number; data: unknown }>;
};

export type PrismaStub = {
  restore: () => void;
};

export function installGoldenPathPrismaStub(state: GoldenPathPrismaState): PrismaStub {
  const originals = {
    pedidoFindUnique: prisma.pedido.findUnique,
    pedidoFindFirst: prisma.pedido.findFirst,
    pedidoUpdate: prisma.pedido.update,
    productoWebFindMany: prisma.productoWeb.findMany,
    productoSfactoryFindMany: prisma.productoSfactory.findMany,
    empresaEnvioConfigFindUnique: prisma.empresaEnvioConfig.findUnique,
    pedidoEnvioLogCreate: prisma.pedidoEnvioLog.create,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedido.findUnique = (async (args: any) => {
    const id = args?.where?.id;
    if (typeof id !== 'number') return null;
    const row = state.pedidos.get(id);
    if (!row) return null;
    if (args?.include?.items) {
      return { ...row, items: row.items ?? [] };
    }
    return row;
  }) as typeof prisma.pedido.findUnique;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedido.findFirst = (async (args: any) => {
    const id = args?.where?.id;
    const empresaId = args?.where?.empresaId;
    for (const row of state.pedidos.values()) {
      if (id != null && row.id !== id) continue;
      if (empresaId != null && row.empresaId !== empresaId) continue;
      return row;
    }
    return null;
  }) as typeof prisma.pedido.findFirst;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedido.update = (async (args: any) => {
    const id = args?.where?.id;
    if (typeof id !== 'number') {
      throw new Error('pedido.update stub: id requerido');
    }
    state.pedidoUpdates.push({ id, data: args.data });
    const existing = state.pedidos.get(id);
    if (existing) {
      state.pedidos.set(id, { ...existing, ...(args.data as Partial<Pedido>) });
    }
    return state.pedidos.get(id) ?? ({ id, ...(args.data as object) } as Pedido);
  }) as typeof prisma.pedido.update;

  prisma.productoWeb.findMany = (async () =>
    state.productoWebRows) as typeof prisma.productoWeb.findMany;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.productoSfactory.findMany = (async (args: any) => {
    const codes = args?.where?.codigo;
    const inList =
      codes && typeof codes === 'object' && 'in' in codes && Array.isArray(codes.in)
        ? (codes.in as string[])
        : null;
    if (!inList) return state.productoSfactoryRows;
    return state.productoSfactoryRows.filter((r) => inList.includes(r.codigo));
  }) as typeof prisma.productoSfactory.findMany;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.empresaEnvioConfig.findUnique = (async (args: any) => {
    const empresaId = args?.where?.empresaId;
    if (typeof empresaId !== 'number') return null;
    return state.envioConfigByEmpresa.get(empresaId) ?? null;
  }) as typeof prisma.empresaEnvioConfig.findUnique;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedidoEnvioLog.create = (async (args: any) => {
    state.envioLogs.push(args.data);
    return { id: state.envioLogs.length, ...(args.data as object) };
  }) as unknown as typeof prisma.pedidoEnvioLog.create;

  return {
    restore: () => {
      prisma.pedido.findUnique = originals.pedidoFindUnique;
      prisma.pedido.findFirst = originals.pedidoFindFirst;
      prisma.pedido.update = originals.pedidoUpdate;
      prisma.productoWeb.findMany = originals.productoWebFindMany;
      prisma.productoSfactory.findMany = originals.productoSfactoryFindMany;
      prisma.empresaEnvioConfig.findUnique = originals.empresaEnvioConfigFindUnique;
      prisma.pedidoEnvioLog.create = originals.pedidoEnvioLogCreate;
    },
  };
}

export function createGoldenPathState(
  pedidos: Array<{ pedido: Pedido; items: PedidoItem[] }>,
  envioConfig: EmpresaEnvioConfig,
  productoWebRows: GoldenPathPrismaState['productoWebRows'],
  productoSfactoryRows: GoldenPathPrismaState['productoSfactoryRows']
): GoldenPathPrismaState {
  const pedidoMap = new Map<number, PedidoWithItems>();
  for (const { pedido, items } of pedidos) {
    pedidoMap.set(pedido.id, { ...pedido, items });
  }
  return {
    pedidos: pedidoMap,
    envioConfigByEmpresa: new Map([[envioConfig.empresaId, envioConfig]]),
    productoWebRows,
    productoSfactoryRows,
    envioLogs: [],
    pedidoUpdates: [],
  };
}
