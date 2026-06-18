/** Espesor estimado (cm) por prenda plegada cuando S-Factory no trae alto. */
export function getShippingAltoPorPrendaCm(): number {
  const n = Number(process.env.SHIPPING_ALTO_POR_PRENDA_CM ?? 8);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export interface SubrubroShippingFallback {
  anchoCm: number;
  largoCm: number;
  pesoGrams?: number;
}

/** Fallbacks por subrubro (cm / g) cuando faltan medidas en S-Factory. */
const SUBRUBRO_FALLBACKS: Record<string, SubrubroShippingFallback> = {
  CAMPERA: { anchoCm: 50, largoCm: 80, pesoGrams: 700 },
  BUZO: { anchoCm: 45, largoCm: 70, pesoGrams: 550 },
  REMERA: { anchoCm: 35, largoCm: 45, pesoGrams: 250 },
  PANTALON: { anchoCm: 40, largoCm: 55, pesoGrams: 450 },
  CHOMBA: { anchoCm: 40, largoCm: 50, pesoGrams: 300 },
  CAMISA: { anchoCm: 40, largoCm: 40, pesoGrams: 350 },
};

export function normalizeSubrubroKey(subrubro: string | null | undefined): string {
  return (subrubro ?? '').trim().toUpperCase();
}

export function getSubrubroShippingFallback(
  subrubro: string | null | undefined
): SubrubroShippingFallback | null {
  const key = normalizeSubrubroKey(subrubro);
  if (!key) return null;
  return SUBRUBRO_FALLBACKS[key] ?? null;
}
