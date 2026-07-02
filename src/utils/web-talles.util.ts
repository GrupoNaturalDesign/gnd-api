const STANDARD_WEB_TALLES = new Set([
  '2XS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '34',
  '36',
  '38',
  '40',
  '42',
  '44',
  '46',
  '48',
  '50',
  '52',
  '54',
  '56',
]);

export function filterTallesForWeb(talles: string[]): string[] {
  const unique = Array.from(new Set(talles.filter(Boolean)));
  const hasStandard = unique.some((t) => STANDARD_WEB_TALLES.has(t.toUpperCase()));
  if (!hasStandard) return unique;
  return unique.filter((t) => t.toUpperCase() !== 'OS');
}
