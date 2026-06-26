/**
 * Safe text + display name helpers (PRD FR-012).
 * Prevents null / undefined / "null" / "undefined" / "NaN" from rendering in the UI.
 */

export function safeText(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined' || text === 'NaN') {
    return fallback;
  }
  return text;
}

export function resolveDisplayName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return '-';
  return safeText(
    row.display_name ||
    row.employee_name ||
    row.current_emp_name ||
    row.machine_user_name ||
    row.zkteco_user_name ||
    row.employee_code ||
    row.raw_device_user_id
  );
}