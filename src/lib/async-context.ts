import { AsyncLocalStorage } from 'async_hooks';
import { Request } from 'express';

export interface RequestContext {
  req: Request;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Obtiene el request actual desde el contexto async (para uso en servicios/Prisma).
 */
export function getRequest(): Request | undefined {
  return asyncLocalStorage.getStore()?.req;
}
