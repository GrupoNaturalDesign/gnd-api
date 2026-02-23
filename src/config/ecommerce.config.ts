/**
 * Rubros de SFactory permitidos para el ecommerce.
 * Solo se sincronizan, listan y permiten crear/editar productos de estos rubros.
 * Para ampliar: agregar más IDs al array.
 * 3285 = PRODUCTO WORKWEAR, 3314 = PRODUCTO OFFICE
 */
export const ECOMMERCE_RUBROS_SFACTORY_IDS: number[] = [3285, 3314];

export function isRubroPermitidoEcommerce(sfactoryRubroId: number | null | undefined): boolean {
  if (sfactoryRubroId == null) return false;
  return ECOMMERCE_RUBROS_SFACTORY_IDS.includes(sfactoryRubroId);
}
