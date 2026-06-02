import { mock } from 'node:test';
import type { Request, Response } from 'express';

export type MockPrismaClient = {
  cupon: { findFirst: (...args: unknown[]) => unknown };
  cuponUso: { count: (...args: unknown[]) => unknown; create: (...args: unknown[]) => unknown };
  pedido: {
    findFirst: (...args: unknown[]) => unknown;
    findUnique: (...args: unknown[]) => unknown;
    create: (...args: unknown[]) => unknown;
    update: (...args: unknown[]) => unknown;
    findMany: (...args: unknown[]) => unknown;
  };
  [key: string]: Record<string, (...args: unknown[]) => unknown>;
};

export function createMockPrisma(overrides: Partial<MockPrismaClient> = {}): MockPrismaClient {
  const defaults: MockPrismaClient = {
    cupon: {
      findFirst: mock.fn(() => Promise.resolve(null)),
    },
    cuponUso: {
      count: mock.fn(() => Promise.resolve(0)),
      create: mock.fn((d: unknown) => Promise.resolve({ id: 1, ...(d as object) })),
    },
    pedido: {
      findFirst: mock.fn(() => Promise.resolve(null)),
      findUnique: mock.fn(() => Promise.resolve(null)),
      create: mock.fn((d: unknown) => Promise.resolve({ id: 1, ...(d as object) })),
      update: mock.fn((d: unknown) => Promise.resolve({ id: 1, ...(d as object) })),
      findMany: mock.fn(() => Promise.resolve([])),
    },
  };

  const merged = { ...defaults };
  for (const [key, val] of Object.entries(overrides)) {
    if (val && typeof val === 'object') {
      merged[key] = { ...merged[key], ...val };
    }
  }
  return merged;
}

export function injectMockPrisma(instance: object, mockClient: MockPrismaClient): void {
  (instance as unknown as { prisma: MockPrismaClient }).prisma = mockClient;
}

export function mockExpressReq(overrides: Partial<Request> = {}): Request {
  const req = {
    body: {},
    query: {},
    params: {},
    headers: {},
    method: 'GET',
    url: '/',
    path: '/',
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
  return req;
}

export function mockExpressRes(): Response {
  const res = {
    status: mock.fn(() => res),
    json: mock.fn(() => res),
    send: mock.fn(() => res),
    end: mock.fn(() => res),
    set: mock.fn(() => res),
    header: mock.fn(() => res),
    type: mock.fn(() => res),
  } as unknown as Response;
  return res;
}
