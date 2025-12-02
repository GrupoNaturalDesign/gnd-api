import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';

const app = express();

// ============================================
// Middlewares
// ============================================

// Security
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// Routes
// ============================================

app.use('/api', routes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'GND Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      rubros: '/api/rubros',
      subrubros: '/api/subrubros',
      productos: '/api/productos',
    },
  });
});

// ============================================
// Error Handler
// ============================================

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: 'Conflicto: el registro ya existe',
      message: err.meta?.target
        ? `Ya existe un registro con este ${err.meta.target.join(', ')}`
        : 'El registro ya existe',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'Registro no encontrado',
      message: 'El registro solicitado no existe',
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Error de validación',
      details: err.errors,
    });
  }

  // Default error
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ============================================
// 404 Handler
// ============================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
});

export default app;

