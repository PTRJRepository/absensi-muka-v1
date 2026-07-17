/**
 * Safe text and display name utilities for estate attendance UI.
 */

/**
 * Return a fallback for nullish values.
 */
export function safeText(v: string | null | undefined): string {
  return v ?? '—';
}

/**
 * Resolve display name from the priority chain:
 * employee_name → currentEmpName → zktecoUserName → machineRawUserName
 * → employeeCode → rawDeviceUserId → '—'
 */
export function resolveDisplayName(row: {
  employeeName?: string | null;
  currentEmpName?: string | null;
  zktecoUserName?: string | null;
  machineRawUserName?: string | null;
  employeeCode?: string | null;
  rawDeviceUserId?: string | null;
}): string {
  return (
    row.employeeName ??
    row.currentEmpName ??
    row.zktecoUserName ??
    row.machineRawUserName ??
    row.employeeCode ??
    row.rawDeviceUserId ??
    '—'
  );
}

/**
 * Format a date string as a short weekday name in Indonesian.
 */
export function weekdayShort(dateStr: string): string {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  return names[day] ?? '';
}

/**
 * Check if a date string falls on a Sunday.
 */
export function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

/**
 * Check if a date string is in the past (before today).
 */
export function isPastDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}
