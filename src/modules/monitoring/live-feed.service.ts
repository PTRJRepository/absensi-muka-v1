/**
 * Live Feed Service
 *
 * Provides real-time attendance scan feed for dashboard
 * Part of Phase 3: Real-Time Monitoring
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface LiveAttendanceScan {
  id: number;
  machine_code: string;
  employee_code: string | null;
  raw_device_user_id: string;
  scan_time: Date;
  scan_date: string;
  machine_type: string;
  mapping_status: string;
}

export interface LiveFeedStats {
  last_10_minutes: number;
  last_30_minutes: number;
  last_1_hour: number;
  by_machine: Array<{ machine_code: string; count: number; last_scan: Date | null }>;
}

export class LiveFeedService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Get latest attendance scans
   */
  async getLatestScans(limit: number = 50): Promise<LiveAttendanceScan[]> {
    const sql = `
      SELECT TOP ${limit}
        l.id,
        m.machine_code,
        ISNULL(e.emp_code, l.raw_device_user_id) AS employee_code,
        l.raw_device_user_id,
        l.record_time AS scan_time,
        CONVERT(VARCHAR(10), l.record_date, 120) AS scan_date,
        m.machine_type,
        CASE WHEN e.emp_code IS NULL THEN 'UNMAPPED' ELSE 'MAPPED' END AS mapping_status
      FROM attendance_scan_logs l
      JOIN attendance_machines m ON l.machine_id = m.machine_id
      LEFT JOIN employees e ON l.parsed_employee_code = e.emp_code
      ORDER BY l.record_time DESC
    `;

    return this.sqlClient.query<LiveAttendanceScan>(sql);
  }

  /**
   * Get scans since a specific time
   */
  async getScansSince(since: Date, limit: number = 100): Promise<LiveAttendanceScan[]> {
    const sql = `
      SELECT TOP ${limit}
        l.id,
        m.machine_code,
        ISNULL(e.emp_code, l.raw_device_user_id) AS employee_code,
        l.raw_device_user_id,
        l.record_time AS scan_time,
        CONVERT(VARCHAR(10), l.record_date, 120) AS scan_date,
        m.machine_type,
        CASE WHEN e.emp_code IS NULL THEN 'UNMAPPED' ELSE 'MAPPED' END AS mapping_status
      FROM attendance_scan_logs l
      JOIN attendance_machines m ON l.machine_id = m.machine_id
      LEFT JOIN employees e ON l.parsed_employee_code = e.emp_code
      WHERE l.record_time >= '${since.toISOString()}'
      ORDER BY l.record_time DESC
    `;

    return this.sqlClient.query<LiveAttendanceScan>(sql);
  }

  /**
   * Get new scans since last check (for polling)
   */
  async getNewScansSince(lastId: number, limit: number = 50): Promise<LiveAttendanceScan[]> {
    const sql = `
      SELECT TOP ${limit}
        l.id,
        m.machine_code,
        ISNULL(e.emp_code, l.raw_device_user_id) AS employee_code,
        l.raw_device_user_id,
        l.record_time AS scan_time,
        CONVERT(VARCHAR(10), l.record_date, 120) AS scan_date,
        m.machine_type,
        CASE WHEN e.emp_code IS NULL THEN 'UNMAPPED' ELSE 'MAPPED' END AS mapping_status
      FROM attendance_scan_logs l
      JOIN attendance_machines m ON l.machine_id = m.machine_id
      LEFT JOIN employees e ON l.parsed_employee_code = e.emp_code
      WHERE l.id > ${lastId}
      ORDER BY l.id ASC
    `;

    return this.sqlClient.query<LiveAttendanceScan>(sql);
  }

  /**
   * Get live feed statistics
   */
  async getFeedStats(): Promise<LiveFeedStats> {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Count by time range
    const timeRangeSql = `
      SELECT
        SUM(CASE WHEN record_time >= '${tenMinutesAgo.toISOString()}' THEN 1 ELSE 0 END) AS last_10_min,
        SUM(CASE WHEN record_time >= '${thirtyMinutesAgo.toISOString()}' THEN 1 ELSE 0 END) AS last_30_min,
        SUM(CASE WHEN record_time >= '${oneHourAgo.toISOString()}' THEN 1 ELSE 0 END) AS last_1_hour
      FROM attendance_scan_logs
    `;

    const timeStats = await this.sqlClient.query<{
      last_10_min: number;
      last_30_min: number;
      last_1_hour: number;
    }>(timeRangeSql);

    // Count by machine
    const byMachineSql = `
      SELECT
        m.machine_code,
        COUNT(*) AS count,
        MAX(l.record_time) AS last_scan
      FROM attendance_machines m
      LEFT JOIN attendance_scan_logs l ON m.machine_id = l.machine_id
        AND l.record_time >= '${oneHourAgo.toISOString()}'
      WHERE m.is_active = 1
      GROUP BY m.machine_code
      ORDER BY count DESC
    `;

    const byMachine = await this.sqlClient.query<{
      machine_code: string;
      count: number;
      last_scan: Date | null;
    }>(byMachineSql);

    return {
      last_10_minutes: timeStats[0]?.last_10_min || 0,
      last_30_minutes: timeStats[0]?.last_30_min || 0,
      last_1_hour: timeStats[0]?.last_1_hour || 0,
      by_machine: byMachine,
    };
  }

  /**
   * Get machine status overview
   */
  async getMachineStatus(): Promise<Array<{
    machine_code: string;
    location_name: string;
    access_status: string;
    is_online: boolean;
    last_sync: Date | null;
    scans_last_hour: number;
    total_users: number;
  }>> {
    const sql = `
      SELECT
        m.machine_code,
        m.location_name,
        m.access_status,
        CASE WHEN l.record_time >= DATEADD(MINUTE, -15, GETDATE()) THEN 1 ELSE 0 END AS is_online,
        MAX(l.record_time) AS last_sync,
        COUNT(l.id) AS scans_last_hour,
        (SELECT COUNT(*) FROM machine_user_raw WHERE machine_id = m.machine_id) AS total_users
      FROM attendance_machines m
      LEFT JOIN attendance_scan_logs l ON m.machine_id = l.machine_id
        AND l.record_time >= DATEADD(HOUR, -1, GETDATE())
      WHERE m.is_active = 1
      GROUP BY
        m.machine_code,
        m.location_name,
        m.access_status,
        CASE WHEN l.record_time >= DATEADD(MINUTE, -15, GETDATE()) THEN 1 ELSE 0 END
      ORDER BY m.machine_code
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get latest import batch status
   */
  async getLatestBatchStatus(): Promise<{
    batch_code: string;
    source: string;
    machine_code: string;
    status: string;
    records_total: number;
    records_success: number;
    started_at: Date;
    finished_at: Date | null;
    duration_seconds: number | null;
  }[]> {
    const sql = `
      SELECT TOP 10
        batch_code,
        source,
        ISNULL(machine_code, source) AS machine_code,
        status,
        records_total,
        records_success,
        started_at,
        finished_at,
        CASE
          WHEN finished_at IS NOT NULL
          THEN DATEDIFF(SECOND, started_at, finished_at)
          ELSE NULL
        END AS duration_seconds
      FROM attendance_import_batches
      ORDER BY started_at DESC
    `;

    return this.sqlClient.query(sql);
  }
}
