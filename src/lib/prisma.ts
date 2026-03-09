import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import dotenv from 'dotenv';

// Load environment variables if not already loaded
dotenv.config();

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Parse DATABASE_URL and create adapter config with pool options
function parseDatabaseUrl(url: string | undefined): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;
  idleTimeout?: number;
  multipleStatements?: boolean;
  allowPublicKeyRetrieval?: boolean;
} {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not defined. Please create a .env file in the gnd-back directory with:\n' +
      'DATABASE_URL="mysql://user:password@localhost:3306/database_name"'
    );
  }
  try {
    const dbUrl = new URL(url);
    const baseConfig = {
      host: dbUrl.hostname,
      port: dbUrl.port ? parseInt(dbUrl.port, 10) : 3306,
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbUrl.pathname.slice(1), // Remove leading '/'
    };

    // Configuración del pool de conexiones para evitar timeouts
    // Estas opciones se pasan directamente al adapter de MariaDB
    return {
      ...baseConfig,
      connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '20', 10), // Aumentar límite de conexiones
      acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000', 10), // 60 segundos
      timeout: parseInt(process.env.DB_TIMEOUT || '30000', 10), // 30 segundos
      reconnect: true,
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '300000', 10), // 5 minutos
      // Opciones adicionales para MariaDB
      multipleStatements: false,
      allowPublicKeyRetrieval: true,
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${url}. Expected format: mysql://user:password@host:port/database`);
  }
}

// Lazy initialization of adapter and prisma client
let _adapter: PrismaMariaDb | null = null;
let _prisma: PrismaClient | null = null;

// function getAdapter(): PrismaMariaDb {
//   if (!_adapter) {
//     try {
//       const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);

//       if (process.env.NODE_ENV === 'development') {
//         console.log('🔌 Configurando adapter de MariaDB con pool:', {
//           host: dbConfig.host,
//           port: dbConfig.port,
//           database: dbConfig.database,
//           connectionLimit: dbConfig.connectionLimit,
//           acquireTimeout: dbConfig.acquireTimeout,
//         });
//       }

//       _adapter = new PrismaMariaDb(dbConfig);
//     } catch (error) {
//       console.error('❌ Error al crear adapter de MariaDB:', error);
//       throw error;
//     }
//   }
//   return _adapter;
// }

function getAdapter(): PrismaMariaDb {
  if (!_adapter) {
    const connectionLimit = parseInt(process.env.DB_POOL_LIMIT || '10', 10);
    const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || '30000', 10);
    const acquireTimeout = parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000', 10); // 60s para evitar pool timeout
    _adapter = new PrismaMariaDb({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER!,
      password: process.env.DB_PASS!,
      database: process.env.DB_NAME!,
      connectionLimit,
      connectTimeout,
      acquireTimeout,
    });
  }
  return _adapter;
}

function getPrismaClient(): PrismaClient {
  if (!_prisma) {
    try {
      _prisma = new PrismaClient({
        adapter: getAdapter(),
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });

      // Manejar desconexiones y errores
      _prisma.$on('error' as never, (e: any) => {
        console.error('❌ Error de Prisma:', e);
      });
    } catch (error) {
      console.error('❌ Error al crear Prisma Client:', error);
      throw error;
    }
  }
  return _prisma;
}

// Export prisma with lazy initialization (only initializes when first accessed)
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

// Release connections on process exit (e.g. nodemon restart)
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;

