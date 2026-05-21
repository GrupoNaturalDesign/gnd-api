import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import dotenv from 'dotenv';
import { getMariaPoolConfig } from './db-config';

dotenv.config();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let _adapter: PrismaMariaDb | null = null;
let _prisma: PrismaClient | null = null;

function getAdapter(): PrismaMariaDb {
  if (!_adapter) {
    _adapter = new PrismaMariaDb(getMariaPoolConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]);
  }
  return _adapter;
}

function getPrismaClient(): PrismaClient {
  if (!_prisma) {
    try {
      _prisma = new PrismaClient({
        adapter: getAdapter(),
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      });

      _prisma.$on('error' as never, (e: unknown) => {
        console.error('❌ Error de Prisma:', e);
      });
    } catch (error) {
      console.error('❌ Error al crear Prisma Client:', error);
      throw error;
    }
  }
  return _prisma;
}

export const prisma = (() => {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  const client = getPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }
  return client;
})();

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
