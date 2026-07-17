/**
 * Row and cell key utilities for estate attendance matrix.
 * Ensures stable, unique keys for React rendering.
 */

export function rowKey(row: {
  identityKey?: string;
  currentEmpCode?: string;
  employeeCode?: string;
  machineCode?: string;
  rawDeviceUserId?: string;
}): string {
  if (row.identityKey) return row.identityKey;
  if (row.currentEmpCode) return row.currentEmpCode;
  if (row.employeeCode) return row.employeeCode;
  if (row.machineCode && row.rawDeviceUserId) {
    return `${row.machineCode}:${row.rawDeviceUserId}`;
  }
  return `unknown-${Math.random().toString(36).slice(2, 8)}`;
}

export function cellKey(
  mode: string,
  code: string,
  date: string,
  machine?: string,
  rawId?: string,
): string {
  if (mode === 'datamesin' && machine && rawId) {
    return `${machine}_${rawId}_${date}`;
  }
  return `${code}_${date}`;
}
