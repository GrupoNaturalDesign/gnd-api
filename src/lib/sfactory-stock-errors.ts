/**
 * Error de validación S-Factory: un código del lote no existe en inventario.
 * El cliente lo lanza sin loguear como fallo genérico (el sync lo omite y reintenta).
 */
export class SFactoryMissingItemError extends Error {
  readonly missingItemCode: string;

  constructor(missingItemCode: string, message: string) {
    super(message);
    this.name = 'SFactoryMissingItemError';
    this.missingItemCode = missingItemCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isSFactoryMissingItemError(e: unknown): e is SFactoryMissingItemError {
  return e instanceof SFactoryMissingItemError;
}

/**
 * S-Factory rechaza el lote si un código no existe. Ej.:
 * "El item con code [L-OF-CAM-EXE29] no existe."
 */
export function extractMissingItemCodeFromError(message: string): string | null {
  if (!message || typeof message !== 'string') return null;
  const lower = message.toLowerCase();
  if (!lower.includes('no existe')) return null;

  const m = message.match(/(?:code|código|codigo)\s*\[([^\]]+)\]/i);
  if (m?.[1]) return m[1].trim();

  return null;
}
