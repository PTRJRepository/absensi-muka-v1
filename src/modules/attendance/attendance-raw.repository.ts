/**
 * @deprecated 2026-06-26 — DEAD CODE CLUSTER. Do NOT use.
 *
 * Queries tables DROPPED in Phase A cleanup:
 *   - attendance_raw_log (DROPPED — replaced by attendance_scan_logs)
 *   - mst_machine (DROPPED — replaced by attendance_machines)
 *   - machine_user_map (DROPPED — 0 rows, replaced by employees.parsed_employee_code/current_emp_code resolved at import)
 *
 * No route mounts this repository's methods. Live raw data access uses
 * attendance_scan_logs directly (parsed_employee_code + current_emp_code
 * already resolved at sync time, no map JOIN needed).
 *
 * Retained for git history reference only. Will be removed in a later phase.
 *
 * Attendance Raw Repository
 *
 * Data access layer for attendance_raw_log table
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface AttendanceRawLog {
  raw_log_id: number;
  import_batch_id: number;
  machine_id: number;
  machine_user_id: string;
  machine_uid?: number;
  user_sn?: number;
  record_time: Date;
  record_date: Date;
  verify_mode?: string;
  in_out_mode?: string;
  device_ip?: string;
  device_sn?: string;
  raw_payload?: string;
  is_processed: boolean;
  processed_at?: Date;
  imported_at: Date;
}

export class AttendanceRawRepository {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Get unprocessed raw logs
   */
  async findUnprocessed(limit: number = 1000): Promise<AttendanceRawLog[]> {
    return this.sqlClient.select<AttendanceRawLog>(
      'attendance_raw_log',
      '*',
      'is_processed = 0',
      'record_time',
      limit
    );
  }

  /**
   * Get raw logs by date range
   */
  async findByDateRange(dateFrom: Date, dateTo: Date): Promise<AttendanceRawLog[]> {
    return this.sqlClient.select<AttendanceRawLog>(
      'attendance_raw_log',
      '*',
      `record_date >= '${this.formatDate(dateFrom)}' AND record_date <= '${this.formatDate(dateTo)}'`,
      'record_time'
    );
  }

  /**
   * Get raw logs by machine and date
   */
  async findByMachineAndDate(
    machineId: number,
    date: Date
  ): Promise<AttendanceRawLog[]> {
    return this.sqlClient.select<AttendanceRawLog>(
      'attendance_raw_log',
      '*',
      `machine_id = ${machineId} AND record_date = '${this.formatDate(date)}'`,
      'record_time'
    );
  }

  /**
   * Get raw logs by employee (via machine_user_map)
   */
  async findByEmployee(empCode: string, dateFrom: Date, dateTo: Date): Promise<AttendanceRawLog[]> {
    const sql = `
      SELECT l.*
      FROM attendance_raw_log l
      JOIN machine_user_map m ON l.machine_id = m.machine_id AND l.machine_user_id = m.machine_user_id
      WHERE m.emp_code = '${empCode}'
        AND l.record_date >= '${this.formatDate(dateFrom)}'
        AND l.record_date <= '${this.formatDate(dateTo)}'
      ORDER BY l.record_time
    `;

    return this.sqlClient.query<AttendanceRawLog>(sql);
  }

  /**
   * Mark logs as processed
   */
  async markAsProcessed(rawLogIds: number[]): Promise<void> {
    if (rawLogIds.length === 0) return;

    const ids = rawLogIds.join(',');
    await this.sqlClient.update(
      'attendance_raw_log',
      {
        is_processed: true,
        processed_at: new Date(),
      },
      `raw_log_id IN (${ids})`
    );
  }

  /**
   * Get daily scan count by employee
   */
  async getDailyScanCount(
    empCode: string,
    date: Date
  ): Promise<{ scan_count: number; machine_count: number }> {
    const sql = `
      SELECT 
        COUNT(*) AS scan_count,
        COUNT(DISTINCT l.machine_id) AS machine_count
      FROM attendance_raw_log l
      JOIN machine_user_map m ON l.machine_id = m.machine_id AND l.machine_user_id = m.machine_user_id
      WHERE m.emp_code = '${empCode}'
        AND l.record_date = '${this.formatDate(date)}'
    `;

    const result = await this.sqlClient.query<{ scan_count: number; machine_count: number }>(sql);
    return result[0] || { scan_count: 0, machine_count: 0 };
  }

  /**
   * Get first and last scan time for employee on date
   */
  async getFirstLastScan(
    empCode: string,
    date: Date
  ): Promise<{ first_scan: Date | null; last_scan: Date | null }> {
    const sql = `
      SELECT 
        MIN(l.record_time) AS first_scan,
        MAX(l.record_time) AS last_scan
      FROM attendance_raw_log l
      JOIN machine_user_map m ON l.machine_id = m.machine_id AND l.machine_user_id = m.machine_user_id
      WHERE m.emp_code = '${empCode}'
        AND l.record_date = '${this.formatDate(date)}'
    `;

    const result = await this.sqlClient.query<{ first_scan: Date | null; last_scan: Date | null }>(sql);
    return result[0] || { first_scan: null, last_scan: null };
  }

  /**
   * Get unmapped device users (no entry in machine_user_map)
   */
  async getUnmappedDeviceUsers(): Promise<Array<{
    machine_code: string;
    machine_user_id: string;
    total_scans: number;
    first_scan: Date;
    last_scan: Date;
  }>> {
    const sql = `
      SELECT 
        m.machine_code,
        l.machine_user_id,
        COUNT(*) AS total_scans,
        MIN(l.record_time) AS first_scan,
        MAX(l.record_time) AS last_scan
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      LEFT JOIN machine_user_map map 
        ON l.machine_id = map.machine_id 
        AND l.machine_user_id = map.machine_user_id
      WHERE map.map_id IS NULL
      GROUP BY m.machine_code, l.machine_user_id
      ORDER BY total_scans DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    total_logs: number;
    processed_logs: number;
    unprocessed_logs: number;
    processing_rate: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) AS total_logs,
        SUM(CASE WHEN is_processed = 1 THEN 1 ELSE 0 END) AS processed_logs,
        SUM(CASE WHEN is_processed = 0 THEN 1 ELSE 0 END) AS unprocessed_logs
      FROM attendance_raw_log
    `;

    const result = await this.sqlClient.query<{
      total_logs: number;
      processed_logs: number;
      unprocessed_logs: number;
    }>(sql);

    const stats = result[0] || { total_logs: 0, processed_logs: 0, unprocessed_logs: 0 };
    const processing_rate = stats.total_logs > 0 
      ? (stats.processed_logs / stats.total_logs) * 100 
      : 0;

    return {
      ...stats,
      processing_rate,
    };
  }

  /**
   * Get duplicate scan candidates
   * Returns records where same user scanned at same time on same machine
   */
  async getDuplicateScans(limit: number = 100): Promise<Array<{
    machine_code: string;
    machine_user_id: string;
    record_time: Date;
    duplicate_count: number;
    first_log_id: number;
  }>> {
    const sql = `
      SELECT TOP ${limit}
        m.machine_code,
        l.machine_user_id,
        l.record_time,
        COUNT(*) AS duplicate_count,
        MIN(l.raw_log_id) AS first_log_id
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      GROUP BY m.machine_code, l.machine_user_id, l.record_time
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get duplicate scans with all log IDs for cleanup
   */
  async getDuplicateScanDetails(
    machineCode: string,
    machineUserId: string,
    recordTime: Date
  ): Promise<AttendanceRawLog[]> {
    const sql = `
      SELECT l.*
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      WHERE m.machine_code = '${machineCode}'
        AND l.machine_user_id = '${machineUserId}'
        AND l.record_time = '${recordTime.toISOString()}'
      ORDER BY l.raw_log_id
    `;

    return this.sqlClient.query<AttendanceRawLog>(sql);
  }

  /**
   * Delete duplicate records keeping the first one
   */
  async deleteDuplicateScans(
    machineCode: string,
    machineUserId: string,
    recordTime: Date,
    keepLogId: number
  ): Promise<number> {
    const sql = `
      DELETE FROM attendance_raw_log
      WHERE raw_log_id IN (
        SELECT raw_log_id
        FROM (
          SELECT raw_log_id,
                 ROW_NUMBER() OVER (ORDER BY raw_log_id) AS rn
          FROM attendance_raw_log l
          JOIN mst_machine m ON l.machine_id = m.machine_id
          WHERE m.machine_code = '${machineCode}'
            AND l.machine_user_id = '${machineUserId}'
            AND l.record_time = '${recordTime.toISOString()}'
        ) AS duplicates
        WHERE rn > 1
      )
    `;

    await this.sqlClient.query(sql);
    return 1; // Rows affected not available via this client
  }

  /**
   * Check machine time drift
   * Compares machine scan timestamps vs server time
   */
  async checkMachineTimeDrift(
    machineCode: string,
    sampleSize: number = 10
  ): Promise<{
    machine_code: string;
    sample_count: number;
    avg_drift_seconds: number;
    max_drift_seconds: number;
    drift_direction: 'AHEAD' | 'BEHIND' | 'SYNCED';
    is_within_tolerance: boolean;
    recommendation: string;
  } | null> {
    const sql = `
      SELECT TOP ${sampleSize}
        m.machine_code,
        l.record_time,
        l.device_ip,
        DATEDIFF(SECOND, l.record_time, GETDATE()) AS drift_seconds
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      WHERE m.machine_code = '${machineCode}'
      ORDER BY l.record_time DESC
    `;

    const samples = await this.sqlClient.query<{
      machine_code: string;
      record_time: Date;
      device_ip: string;
      drift_seconds: number;
    }>(sql);

    if (samples.length === 0) {
      return null;
    }

    const drifts = samples.map(s => s.drift_seconds);
    const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const maxDrift = Math.max(...drifts.map(Math.abs));
    const driftDirection = avgDrift > 30 ? 'AHEAD' : avgDrift < -30 ? 'BEHIND' : 'SYNCED';
    const withinTolerance = maxDrift <= 300; // 5 minutes tolerance

    let recommendation = 'Machine time is synchronized.';
    if (!withinTolerance) {
      recommendation = `WARNING: Machine time drift is ${Math.round(maxDrift / 60)} minutes. Consider syncing machine clock.`;
    } else if (driftDirection !== 'SYNCED') {
      recommendation = `NOTICE: Machine time is ${driftDirection === 'AHEAD' ? 'ahead' : 'behind'} by ~${Math.round(Math.abs(avgDrift) / 60)} minutes.`;
    }

    return {
      machine_code: machineCode,
      sample_count: samples.length,
      avg_drift_seconds: Math.round(avgDrift),
      max_drift_seconds: maxDrift,
      drift_direction: driftDirection,
      is_within_tolerance: withinTolerance,
      recommendation,
    };
  }

  /**
   * Get time drift for all machines
   */
  async getAllMachineTimeDrift(sampleSize: number = 10): Promise<Array<{
    machine_code: string;
    avg_drift_seconds: number;
    max_drift_seconds: number;
    drift_direction: string;
    is_within_tolerance: boolean;
  }>> {
    const sql = `
      SELECT
        m.machine_code,
        AVG(DATEDIFF(SECOND, l.record_time, GETDATE())) AS avg_drift_seconds,
        MAX(ABS(DATEDIFF(SECOND, l.record_time, GETDATE()))) AS max_drift_seconds,
        CASE
          WHEN AVG(DATEDIFF(SECOND, l.record_time, GETDATE())) > 30 THEN 'AHEAD'
          WHEN AVG(DATEDIFF(SECOND, l.record_time, GETDATE())) < -30 THEN 'BEHIND'
          ELSE 'SYNCED'
        END AS drift_direction,
        CASE
          WHEN MAX(ABS(DATEDIFF(SECOND, l.record_time, GETDATE()))) <= 300 THEN 1
          ELSE 0
        END AS is_within_tolerance
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      GROUP BY m.machine_code
      ORDER BY max_drift_seconds DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
