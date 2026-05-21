/**
 * S-Factory a veces devuelve result.message como string y otras como objeto { title, error }.
 */
export function normalizeSFactoryErrorMessage(message: unknown): string {
  if (message == null || message === '') {
    return 'Error en S-Factory API';
  }
  if (typeof message === 'string') {
    return message;
  }
  if (typeof message === 'object' && message !== null) {
    const m = message as Record<string, unknown>;
    if (typeof m.title === 'string') {
      return m.title;
    }
    if (typeof m.message === 'string') {
      return m.message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return 'Error en S-Factory API';
    }
  }
  return String(message);
}
