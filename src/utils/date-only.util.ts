export const AR_TIMEZONE = 'America/Argentina/Cordoba';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de hoy (YYYY-MM-DD) en Argentina. */
export function todayDateOnlyAR(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TIMEZONE }).format(now);
}

/** Extrae YYYY-MM-DD de un Date guardado como medianoche UTC (input type="date"). */
export function dateOnlyFromStoredDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parsea YYYY-MM-DD a medianoche UTC (fecha de calendario, sin corrimiento horario). */
export function parseDateOnlyUtc(dateStr: string): Date {
  if (!DATE_ONLY_RE.test(dateStr)) {
    throw new Error(`Fecha inválida: ${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}
