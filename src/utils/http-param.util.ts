/** Express 5: req.params values are `string | string[]`. */
export function paramAsString(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}
