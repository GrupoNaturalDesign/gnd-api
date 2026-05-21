export type AdminSearchFilterParam = 'search' | 'q';

export function buildAdminListHref(
  path: string,
  filter: { param: AdminSearchFilterParam; value: string }
): string {
  const params = new URLSearchParams();
  params.set(filter.param, filter.value);
  params.set('page', '1');
  return `${path}?${params.toString()}`;
}
