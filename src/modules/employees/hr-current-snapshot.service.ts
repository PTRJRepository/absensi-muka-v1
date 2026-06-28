/**
 * HR Current Snapshot Service
 *
 * Provides read-only queries for hr_reference table (unified from hr_employee_current_snapshot and employee_code_history).
 * This table tracks NIK-based employee data and historical code changes.
 */

import { query, sql } from '../../lib/db';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SnapshotEntry {
  id: number;
  nik: string;
  currentEmpCode: string;
  currentEmpName: string | null;
  currentLocCode: string | null;
  currentStatus: string | null;
  currentCreateDate: Date | null;
  currentUpdateDate: Date | null;
  activeCount: number;
  rowCount: number;
  isAmbiguous: boolean;
  ambiguityReason: string | null;
  syncedAt: Date;
}

export interface CodeHistoryEntry {
  id: number;
  nik: string;
  empCode: string;
  empName: string | null;
  locCode: string | null;
  hrStatus: string | null;
  createDate: Date | null;
  updateDate: Date | null;
  isCurrent: boolean;
  syncedAt: Date;
}

export interface SyncStats {
  snapshotCount: number;
  historyCount: number;
  ambiguousCount: number;
  lastSyncAt: Date | null;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// ─── NIK Normalization ────────────────────────────────────────────────────────

/**
 * Normalize NIK: trim whitespace and remove all spaces
 */
function normalizeNik(nik: string): string {
  return nik?.trim().replace(/\s+/g, '') || '';
}

// ─── Mapping Functions ─────────────────────────────────────────────────────────

/**
 * Map database row to SnapshotEntry
 */
function mapToSnapshotEntry(row: Record<string, unknown>): SnapshotEntry {
  return {
    id: Number(row['id']) || 0,
    nik: String(row['nik'] || ''),
    currentEmpCode: String(row['current_emp_code'] || ''),
    currentEmpName: row['current_emp_name'] as string | null,
    currentLocCode: row['current_loc_code'] as string | null,
    currentStatus: row['current_status'] as string | null,
    currentCreateDate: row['current_create_date'] as Date | null,
    currentUpdateDate: row['current_update_date'] as Date | null,
    activeCount: Number(row['active_count']) || 0,
    rowCount: Number(row['row_count']) || 0,
    isAmbiguous: Boolean(row['is_ambiguous']),
    ambiguityReason: row['ambiguity_reason'] as string | null,
    syncedAt: row['synced_at'] as Date,
  };
}

/**
 * Map database row to CodeHistoryEntry
 */
function mapToCodeHistoryEntry(row: Record<string, unknown>): CodeHistoryEntry {
  return {
    id: Number(row['id']) || 0,
    nik: String(row['nik'] || ''),
    empCode: String(row['emp_code'] || ''),
    empName: row['emp_name'] as string | null,
    locCode: row['loc_code'] as string | null,
    hrStatus: row['hr_status'] as string | null,
    createDate: row['create_date'] as Date | null,
    updateDate: row['update_date'] as Date | null,
    isCurrent: Boolean(row['is_current']),
    syncedAt: row['synced_at'] as Date,
  };
}

// ─── Service Class ────────────────────────────────────────────────────────────

export class HrCurrentSnapshotService {
  // ─── Lookup Methods ────────────────────────────────────────────────────────

  /**
   * Get snapshot by NIK
   * @param nik - Employee NIK (will be normalized)
   * @returns SnapshotEntry or null if not found
   */
  async getByNik(nik: string): Promise<SnapshotEntry | null> {
    const normalizedNik = normalizeNik(nik);

    if (!normalizedNik) {
      return null;
    }

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP 1
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND nik = @nik
    `, [
      { name: 'nik', type: sql.NVarChar, value: normalizedNik },
    ]);

    if (rows.length === 0) {
      return null;
    }

    return mapToSnapshotEntry(rows[0]);
  }

  /**
   * Get snapshot by current employee code
   * @param empCode - Employee code (will be uppercased and trimmed)
   * @returns SnapshotEntry or null if not found
   */
  async getByCurrentEmpCode(empCode: string): Promise<SnapshotEntry | null> {
    const normalizedCode = empCode?.trim().toUpperCase() || '';

    if (!normalizedCode) {
      return null;
    }

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP 1
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND emp_code = @empCode
    `, [
      { name: 'empCode', type: sql.NVarChar, value: normalizedCode },
    ]);

    if (rows.length === 0) {
      return null;
    }

    return mapToSnapshotEntry(rows[0]);
  }

  /**
   * Get all historical codes for a NIK
   * @param nik - Employee NIK (will be normalized)
   * @returns Array of CodeHistoryEntry ordered by update_date DESC
   */
  async getCodeHistory(nik: string): Promise<CodeHistoryEntry[]> {
    const normalizedNik = normalizeNik(nik);

    if (!normalizedNik) {
      return [];
    }

    const rows = await query<Record<string, unknown>>(`
      SELECT
        id,
        nik,
        emp_code,
        emp_name,
        loc_code,
        hr_status,
        create_date,
        update_date,
        is_current,
        synced_at
      FROM hr_reference
      WHERE type = 'history' AND nik = @nik
      ORDER BY update_date DESC, id DESC
    `, [
      { name: 'nik', type: sql.NVarChar, value: normalizedNik },
    ]);

    return rows.map(mapToCodeHistoryEntry);
  }

  // ─── List/Pagination Methods ─────────────────────────────────────────────────

  /**
   * Get paginated list of all snapshots
   * @param options - Pagination options (limit: default 100, offset: default 0)
   * @returns Array of SnapshotEntry
   */
  async getAllSnapshots(options: PaginationOptions = {}): Promise<SnapshotEntry[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const offset = Math.max(options.offset ?? 0, 0);

    const rows = await query<Record<string, unknown>>(`
      SELECT
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current'
      ORDER BY nik ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, [
      { name: 'limit', type: sql.Int, value: limit },
      { name: 'offset', type: sql.Int, value: offset },
    ]);

    return rows.map(mapToSnapshotEntry);
  }

  /**
   * Get NIKs marked as ambiguous for manual review
   * @param options - Limit option (default: 100)
   * @returns Array of ambiguous SnapshotEntry
   */
  async getAmbiguousNik(options: { limit?: number } = {}): Promise<SnapshotEntry[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP (@limit)
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND is_ambiguous = 1
      ORDER BY synced_at DESC
    `, [
      { name: 'limit', type: sql.Int, value: limit },
    ]);

    return rows.map(mapToSnapshotEntry);
  }

  /**
   * Find snapshots not synced recently
   * @param hoursSinceSync - Hours since last sync (default: 24)
   * @returns Array of stale SnapshotEntry
   */
  async getStaleSnapshots(hoursSinceSync: number = 24): Promise<SnapshotEntry[]> {
    const hours = Math.max(hoursSinceSync, 1);

    const rows = await query<Record<string, unknown>>(`
      SELECT
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND synced_at < DATEADD(HOUR, -@hours, SYSUTCDATETIME())
      ORDER BY synced_at ASC
    `, [
      { name: 'hours', type: sql.Int, value: hours },
    ]);

    return rows.map(mapToSnapshotEntry);
  }

  // ─── Statistics Methods ─────────────────────────────────────────────────────

  /**
   * Get sync statistics for monitoring
   * @returns SyncStats object with counts and last sync time
   */
  async getSyncStats(): Promise<SyncStats> {
    const rows = await query<{
      snapshot_count: number;
      history_count: number;
      ambiguous_count: number;
      last_sync_at: Date | null;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM hr_reference WHERE type = 'current') AS snapshot_count,
        (SELECT COUNT(*) FROM hr_reference WHERE type = 'history') AS history_count,
        (SELECT COUNT(*) FROM hr_reference WHERE type = 'current' AND is_ambiguous = 1) AS ambiguous_count,
        (SELECT MAX(synced_at) FROM hr_reference) AS last_sync_at
    `);

    const stats = rows[0];
    return {
      snapshotCount: Number(stats?.snapshot_count ?? 0),
      historyCount: Number(stats?.history_count ?? 0),
      ambiguousCount: Number(stats?.ambiguous_count ?? 0),
      lastSyncAt: stats?.last_sync_at ?? null,
    };
  }

  // ─── Search Methods ────────────────────────────────────────────────────────

  /**
   * Search snapshots by employee code pattern
   * @param pattern - Search pattern (partial match)
   * @param limit - Maximum results (default: 50)
   * @returns Array of matching SnapshotEntry
   */
  async searchByEmpCode(pattern: string, limit: number = 50): Promise<SnapshotEntry[]> {
    const normalizedPattern = `%${pattern?.trim().toUpperCase() || ''}%`;
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP (@limit)
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        NULL AS active_count,
        NULL AS row_count,
        is_ambiguous,
        ambiguity_reason,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND (
        emp_code LIKE @pattern
        OR emp_name LIKE @pattern
        OR nik LIKE @pattern
      )
      ORDER BY emp_code ASC
    `, [
      { name: 'pattern', type: sql.NVarChar, value: normalizedPattern },
      { name: 'limit', type: sql.Int, value: safeLimit },
    ]);

    return rows.map(mapToSnapshotEntry);
  }

  /**
   * Search code history by employee code pattern
   * @param pattern - Search pattern (partial match)
   * @param limit - Maximum results (default: 50)
   * @returns Array of matching CodeHistoryEntry
   */
  async searchCodeHistory(pattern: string, limit: number = 50): Promise<CodeHistoryEntry[]> {
    const normalizedPattern = `%${pattern?.trim().toUpperCase() || ''}%`;
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP (@limit)
        id,
        nik,
        emp_code,
        emp_name,
        loc_code,
        hr_status,
        create_date,
        update_date,
        is_current,
        synced_at
      FROM hr_reference
      WHERE type = 'history' AND (
        emp_code LIKE @pattern
        OR emp_name LIKE @pattern
        OR nik LIKE @pattern
      )
      ORDER BY update_date DESC
    `, [
      { name: 'pattern', type: sql.NVarChar, value: normalizedPattern },
      { name: 'limit', type: sql.Int, value: safeLimit },
    ]);

    return rows.map(mapToCodeHistoryEntry);
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const hrCurrentSnapshotService = new HrCurrentSnapshotService();
