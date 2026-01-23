import { Request } from 'express';
import { ZodError } from 'zod';

export function getEmpresaId(req: Request): number | null {
  const empresaId = (req as any).empresaId || req.query.empresaId;
  if (empresaId) {
    const num = Number(empresaId);
    return !isNaN(num) && num > 0 ? num : null;
  }
  return null;
}

export function validateEmpresaId(req: Request): { empresaId: number } | { error: string; details: any[] } {
  const empresaId = getEmpresaId(req);
  
  if (!empresaId) {
    return {
      error: 'Sesión no inicializada',
      details: [
        {
          code: 'session_not_initialized',
          path: ['empresaId'],
          message: 'Inicializa la sesión con POST /api/sfactory/auth/init o proporciona empresaId en query params',
        },
      ],
    };
  }
  
  return { empresaId };
}

export function handleZodError(error: unknown): { error: string; details: any[] } | null {
  if (error instanceof ZodError) {
    return {
      error: 'Parámetros inválidos',
      details: error.issues,
    };
  }
  return null;
}
