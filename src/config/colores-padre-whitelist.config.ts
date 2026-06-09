import type { ColorCanonico } from '../constants/variantes-filtros';

/**
 * Colores permitidos en tienda por codigo_agrupacion (NTDS / feedback cliente).
 * Si el padre no está en el mapa, no se filtra por color (solo depósito + rubros).
 */
export const COLORES_PERMITIDOS_POR_PADRE: Readonly<
  Record<string, readonly ColorCanonico[]>
> = {
  'L-OF-CAM-JOY_D': ['CELESTE', 'RAYA COMBINADA', 'RAYADO CELESTE ANCHO'],

  'L-OF-CAM-MAN_D': ['CELESTE'],

  'L-OF-CAM-MAN_H': [
    'CELESTE',
    'AZUL MARINO',
    'RAYA COMBINADA',
    'RAYA AZUL',
  ],

  'L-WW-CAM-WR_H': ['AZUL MARINO', 'GRIS TOPO'],
  'L-WW-CAM-WR_D': ['AZUL MARINO', 'GRIS TOPO'],

  'L-OF-TEJ-CAR-CHA_D': [
    'NEGRO',
    'GRIS MELANGE OSCURO',
    'GRIS MELANGE CLARO',
    'AZUL MARINO',
  ],
  'L-OF-TEJ-CAR-CHA_H': [
    'NEGRO',
    'GRIS MELANGE OSCURO',
    'GRIS MELANGE CLARO',
    'AZUL MARINO',
  ],

  'L-OF-TEJ- SW - ESSE_H': [
    'NEGRO',
    'GRIS MELANGE OSCURO',
    'GRIS MELANGE CLARO',
    'AZUL MARINO',
  ],

  'L-OF-CA-BMBES_H': [
    'NEGRO',
    'GRIS MELANGE OSCURO',
    'GRIS MELANGE CLARO',
    'AZUL MARINO',
  ],

  'L-WW-PAN-CIMP_U': ['CEMENTO', 'AZUL MARINO', 'NEGRO'],

  'L-OF-PAN-CBAL_H': ['NEGRO', 'CEMENTO', 'AZUL MARINO', 'GRIS TOPO'],
  'L-OF-PAN-CBAL_D': [
    'NEGRO',
    'AZUL MARINO',
    'ARENA',
    'GRIS TOPO',
  ],

  'L-OF-REM-GEN_D': ['NEGRO', 'BLANCO'],

  'L-WW-CHO-BR_U': ['GRIS TOPO', 'GRIS PERLA', 'AZUL MARINO', 'NEGRO'],

  'L-WW-PAN-CBO_H': ['CEMENTO', 'GRIS TOPO', 'AZUL MARINO'],

  'L-OF-REM-BASPR_D': ['BLANCO', 'AZUL', 'NEGRO', 'GRIS ACERO'],
  'L-OF-REM-BASPR_H': ['BLANCO', 'AZUL', 'NEGRO', 'GRIS ACERO'],

  'L-WW-CA-ROMP_U': ['GRIS', 'NEGRO'],
};
