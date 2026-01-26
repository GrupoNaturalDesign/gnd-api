import dotenv from 'dotenv';
import app from './app';
import { redisService } from './lib/redis';

// Load environment variables
dotenv.config();

// Inicializar Redis (lazy, se conecta cuando se use por primera vez)
redisService.getClient().catch((error) => {
  console.warn('⚠️  Redis no disponible, continuando sin cache:', error.message);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3002;

// Start server
app.listen(PORT, () => {
  console.log('🚀 Servidor corriendo en puerto', PORT);
  console.log(`📍 API disponible en http://localhost:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});