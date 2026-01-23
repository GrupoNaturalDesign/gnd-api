/**
 * Convierte un texto a slug URL-friendly
 * Ejemplo: "Camisa Wrench Hombre" -> "camisa-wrench-hombre"
 */
export function slugify(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos
    .replace(/[^a-z0-9\s-]/g, '') // Elimina caracteres especiales
    .trim()
    .replace(/\s+/g, '-') // Reemplaza espacios con guiones
    .replace(/-+/g, '-') // Reemplaza múltiples guiones con uno solo
    .replace(/^-+|-+$/g, ''); // Elimina guiones al inicio y final
}

/**
 * Crea un slug para el nombre de carpeta del producto
 * Solo incluye nombre base, sin color ni talle
 */
export function slugifyProductName(nombreBase: string): string {
  return slugify(nombreBase);
}

/**
 * Crea un slug para el nombre de archivo de imagen
 * Incluye nombre base y color
 */
export function slugifyImageName(nombreBase: string, color: string): string {
  const nombreSlug = slugify(nombreBase);
  const colorSlug = slugify(color);
  return `${nombreSlug}-${colorSlug}`;
}

