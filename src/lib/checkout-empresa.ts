/** `EMPRESA_ID` del entorno — tienda monomarca en checkout público. */
export function getCheckoutEmpresaIdFromEnv(): number {
  const raw = process.env.EMPRESA_ID;
  const n = raw != null && raw !== '' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('EMPRESA_ID debe ser un entero positivo en el entorno');
  }
  return n;
}
