import dotenv from 'dotenv';
import app from './app';
import { prisma } from './lib/prisma';

// Load environment variables
dotenv.config();

// Evitar que el proceso se caiga por rechazos de promesas o excepciones no capturadas
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
  // No hacer process.exit(): el servidor sigue corriendo y las requests pueden seguir respondiendo 5xx
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Loguear y dar tiempo a que los handlers de SIGTERM/SIGINT cierren bien si se decide hacer exit
  // Por ahora no hacemos exit para que el servidor no se caiga; en producción podrías hacer shutdown() aquí
});

// Redis desactivado por ahora (activar con REDIS_ENABLED=true en .env)

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected' });
  } catch {
    res.status(503).json({ ok: false, db: 'disconnected' });
  }
});

const PORT = process.env.PORT || 3002;

function start() {
  app.listen(PORT, () => {
    console.log('🚀 Servidor corriendo en puerto', PORT);
    console.log(`📍 API disponible en http://localhost:${PORT}/api`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();

// Graceful shutdown: disconnect DB before exit so connections are released on nodemon restart
async function shutdown() {
  console.log('Closing HTTP server and disconnecting DB...');
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  shutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  shutdown();
});