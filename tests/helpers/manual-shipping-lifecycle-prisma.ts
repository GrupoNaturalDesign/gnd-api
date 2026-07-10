import type { Cliente, Empresa, Pedido, PedidoItem } from '@prisma/client';
import prisma from '../../src/lib/prisma';
import {
  createGoldenPathState,
  installGoldenPathPrismaStub,
  type GoldenPathPrismaState,
  type PrismaStub,
} from './shipping-golden-path-prisma';

export type ManualShippingLifecycleState = GoldenPathPrismaState & {
  empresa: Empresa;
  cliente: Cliente;
  sfactoryLogs: unknown[];
};

export function createManualShippingLifecycleState(
  pedido: Pedido,
  items: PedidoItem[],
  envioConfig: Parameters<typeof createGoldenPathState>[1],
  productoWebRows: GoldenPathPrismaState['productoWebRows'],
  productoSfactoryRows: GoldenPathPrismaState['productoSfactoryRows'],
  empresa: Empresa,
  cliente: Cliente
): ManualShippingLifecycleState {
  const base = createGoldenPathState(
    [{ pedido, items }],
    envioConfig,
    productoWebRows,
    productoSfactoryRows
  );
  return {
    ...base,
    empresa,
    cliente,
    sfactoryLogs: [],
  };
}

export function installManualShippingLifecyclePrismaStub(
  state: ManualShippingLifecycleState
): PrismaStub {
  const base = installGoldenPathPrismaStub(state);
  const originals = {
    pedidoFindUnique: prisma.pedido.findUnique,
    pedidoSfactoryLogCreate: prisma.pedidoSfactoryLog.create,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedido.findUnique = (async (args: any) => {
    const id = args?.where?.id;
    if (typeof id !== 'number') return null;
    const row = state.pedidos.get(id);
    if (!row) return null;
    const result: Record<string, unknown> = { ...row };
    if (args?.include?.items) {
      result.items = row.items ?? [];
    }
    if (args?.include?.cliente) {
      result.cliente = state.cliente;
    }
    if (args?.include?.empresa) {
      result.empresa = state.empresa;
    }
    return result as never;
  }) as typeof prisma.pedido.findUnique;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.pedidoSfactoryLog.create = (async (args: any) => {
    state.sfactoryLogs.push(args.data);
    return { id: state.sfactoryLogs.length, ...(args.data as object) };
  }) as unknown as typeof prisma.pedidoSfactoryLog.create;

  const restoreBase = base.restore;
  return {
    restore: () => {
      prisma.pedido.findUnique = originals.pedidoFindUnique;
      prisma.pedidoSfactoryLog.create = originals.pedidoSfactoryLogCreate;
      restoreBase();
    },
  };
}
