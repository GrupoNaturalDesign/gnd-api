/** `EMPRESA_ID` del entorno — tienda monomarca (checkout, middleware, jobs). */
export function tryGetEmpresaIdFromEnv(): number | null {
  const raw = process.env.EMPRESA_ID;
  if (raw == null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function getCheckoutEmpresaIdFromEnv(): number {
  const id = tryGetEmpresaIdFromEnv();
  if (id == null) {
    throw new Error('EMPRESA_ID debe ser un entero positivo en el entorno');
  }
  return id;
}
