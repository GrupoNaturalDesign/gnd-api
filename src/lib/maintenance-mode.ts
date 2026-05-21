/**
 * Modo de mantenimiento del sitio y del panel admin.
 * Mantener sincronizado con client/src/lib/maintenance-mode.ts
 */
export const MaintenanceMode = {
  Off: 'off',
  Public: 'public',
  Admin: 'admin',
  All: 'all',
} as const;

export type MaintenanceMode =
  (typeof MaintenanceMode)[keyof typeof MaintenanceMode];

export const MAINTENANCE_MODE_VALUES: readonly MaintenanceMode[] = [
  MaintenanceMode.Off,
  MaintenanceMode.Public,
  MaintenanceMode.Admin,
  MaintenanceMode.All,
];

export function parseMaintenanceMode(
  raw: string | undefined
): MaintenanceMode {
  const v = (raw ?? MaintenanceMode.Off).toLowerCase().trim();
  if (MAINTENANCE_MODE_VALUES.includes(v as MaintenanceMode)) {
    return v as MaintenanceMode;
  }
  console.warn(
    `[maintenance] MAINTENANCE_MODE inválido "${raw}", usando "${MaintenanceMode.Off}"`
  );
  return MaintenanceMode.Off;
}

export function isPublicMaintenanceBlocked(mode: MaintenanceMode): boolean {
  return mode === MaintenanceMode.Public || mode === MaintenanceMode.All;
}

export function isAdminMaintenanceBlocked(mode: MaintenanceMode): boolean {
  return mode === MaintenanceMode.Admin || mode === MaintenanceMode.All;
}

export function getMaintenanceModeLabel(mode: MaintenanceMode): string {
  switch (mode) {
    case MaintenanceMode.Public:
      return 'tienda pública';
    case MaintenanceMode.Admin:
      return 'panel admin';
    case MaintenanceMode.All:
      return 'tienda y panel admin';
    default:
      return 'desactivado';
  }
}
