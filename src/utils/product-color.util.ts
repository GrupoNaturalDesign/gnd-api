import { canonizarColor, normalizarClaveVariante } from '../constants/variantes-filtros';

export const SIN_COLOR_KEY = 'sin-color';

export function productColorKey(valor: string | null | undefined): string {
  if (!valor?.trim()) return SIN_COLOR_KEY;
  return normalizarClaveVariante(valor);
}

export function colorsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return productColorKey(a) === productColorKey(b);
}

/** Resuelve el label canónico (mismo string que variantes en BD). */
export function resolveCanonicalColorLabel(
  input: string,
  variantColors: (string | null | undefined)[]
): string | null {
  const key = productColorKey(input);
  if (key === SIN_COLOR_KEY) return null;

  for (const c of variantColors) {
    if (c && productColorKey(c) === key) return c;
  }

  return canonizarColor(input) ?? normalizarClaveVariante(input);
}

export function uniqueVariantColors(
  variantColors: (string | null | undefined)[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const c of variantColors) {
    if (!c?.trim()) continue;
    const key = productColorKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }

  return result;
}

export function filterImagesByColorParam<T extends { color: string | null }>(
  images: T[],
  colorFilter: string
): T[] {
  const filterKey = productColorKey(colorFilter);
  return images.filter((img) => productColorKey(img.color) === filterKey);
}

export function groupImagesByColor<T extends { color: string | null }>(
  images: T[],
  variantColors: string[] = []
): Record<string, T[]> {
  const labelByKey = new Map<string, string>();
  for (const c of variantColors) {
    labelByKey.set(productColorKey(c), c);
  }

  const grouped: Record<string, T[]> = {};

  for (const img of images) {
    const key = productColorKey(img.color);
    const label =
      key === SIN_COLOR_KEY
        ? SIN_COLOR_KEY
        : (labelByKey.get(key) ??
          resolveCanonicalColorLabel(img.color!, variantColors) ??
          key);

    const normalizedImg =
      label === SIN_COLOR_KEY
        ? ({ ...img, color: null } as T)
        : ({ ...img, color: label } as T);

    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(normalizedImg);
  }

  return grouped;
}
