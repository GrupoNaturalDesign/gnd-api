import { colorsMatch } from './product-color.util';

export type PadreImagenRow = {
  imagenUrl: string;
  color: string | null;
  orden: number;
};

export function groupPadreImagesByPadreId(
  rows: Array<PadreImagenRow & { productoPadreId: number }>,
): Map<number, PadreImagenRow[]> {
  const map = new Map<number, PadreImagenRow[]>();

  for (const row of rows) {
    const list = map.get(row.productoPadreId) ?? [];
    list.push({
      imagenUrl: row.imagenUrl,
      color: row.color,
      orden: row.orden,
    });
    map.set(row.productoPadreId, list);
  }

  for (const [padreId, list] of map) {
    map.set(
      padreId,
      [...list].sort((a, b) => a.orden - b.orden),
    );
  }

  return map;
}

/** Primera imagen del padre: prioriza sin color, sino la de menor orden. */
export function firstPadreImagenUrl(images: PadreImagenRow[]): string | null {
  if (images.length === 0) return null;
  const sinColor = images.filter((i) => !i.color);
  return (sinColor[0] ?? images[0])?.imagenUrl ?? null;
}

/** Imagen del padre para un color concreto; fallback a sin-color. */
export function padreImagenForColor(
  images: PadreImagenRow[],
  color: string | null | undefined,
): string | null {
  if (!color?.trim()) return firstPadreImagenUrl(images);

  const matched = images.find(
    (i) => i.color && colorsMatch(i.color, color),
  );
  if (matched) return matched.imagenUrl;

  return firstPadreImagenUrl(images.filter((i) => !i.color));
}

/** Imágenes del padre aplicables a una variante (misma lógica que admin). */
export function padreImagenesForVariante(
  images: PadreImagenRow[],
  color: string | null | undefined,
): PadreImagenRow[] {
  if (!color?.trim()) {
    const sinColor = images.filter((i) => !i.color);
    return sinColor.length > 0 ? sinColor : images;
  }

  const forColor = images.filter(
    (i) => !i.color || colorsMatch(i.color, color),
  );
  return forColor.length > 0 ? forColor : images.filter((i) => !i.color);
}

type ProductoWebConImagenes = {
  color?: string | null;
  imagenes?: Array<{
    id?: number;
    imagenUrl: string;
    orden: number;
    color?: string | null;
  }>;
};

/**
 * Enriquece variantes activas con imágenes a nivel padre cuando su include viene vacío
 * (p. ej. fotos en otra fila producto_web del mismo padre).
 */
export function enrichProductosWebWithPadreImages(
  productosWeb: ProductoWebConImagenes[],
  padreImages: PadreImagenRow[],
): void {
  if (padreImages.length === 0) return;

  for (const variante of productosWeb) {
    if (variante.imagenes && variante.imagenes.length > 0) continue;

    const toAttach = padreImagenesForVariante(padreImages, variante.color);
    if (toAttach.length === 0) continue;

    variante.imagenes = toAttach.map((img) => ({
      id: 0,
      imagenUrl: img.imagenUrl,
      orden: img.orden,
      color: img.color,
    }));
  }
}
