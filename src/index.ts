import dotenv from 'dotenv';
import app from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3002;

// Start server
app.listen(PORT, () => {
  console.log('🚀 Servidor corriendo en puerto', PORT);
  console.log(`📍 API disponible en http://localhost:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('Endpoints disponibles:');
  console.log(`  - Health: http://localhost:${PORT}/api/health`);
  console.log(`  - Rubros: http://localhost:${PORT}/api/rubros`);
  console.log(`  - Subrubros: http://localhost:${PORT}/api/subrubros`);
  console.log(`  - Productos: http://localhost:${PORT}/api/productos`);
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