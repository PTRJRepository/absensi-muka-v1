/**
 * Dashboard Service
 * 
 * Aggregates data for monitoring dashboard
 */

import { SqlClient } from '../../shared/database/sql-client';
import { SummaryService, DailySummary } from './summary.service';
import { AnomalyService } from './anomaly.service';

export interface DashboardOverview {
  date: Date;
  summary: DailySummary | null;
  topAnomalies: Array<{
    anomaly_type: string;
    count: number;
    severity: string;
  }>;
  divisionBreakdown: Array<{
    division_code: string;
    division_name: string;
    total_employee: number;
    total_present: number;
    attendance_rate: number;
  }>;
  recentActivity: Array<{
    activity_type: string;
    description: string;
    timestamp: Date;
  }>;
}

export class DashboardService {
  constructor(
    private sqlClient: SqlClient,
    private summaryService: SummaryService,
    private anomalyService: AnomalyService
  ) {}

  /**
   * Get dashboard overview for date
   */
  async getDashboardOverview(date: Date): Promise<DashboardOverview> {
    const [summary, topAnomalies, divisionBreakdown, recentActivity] = await Promise.all([
      this.summaryService.getSummary(date),
      this.getTopAnomalies(date),
      this.getDivisionBreakdown(date),
      this.getRecentActivity(date),
    ]);

    return {
      date,
      summary,
      topAnomalies,
      divisionBreakdown,
      recentActivity,
    };
  }

  /**
   * Get top anomalies for date
   */
  private async getTopAnomalies(date: Date): Promise<Array<{
    anomaly_type: string;
    count: number;
    severity: string;
  }>> {
    const sql = `
      SELECT TOP 5
        anomaly_type,
        COUNT(*) AS count,
        MAX(severity) AS severity
      FROM attendance_anomaly
      WHERE work_date = '${this.formatDate(date)}'
        AND status = 'OPEN'
      GROUP BY anomaly_type
      ORDER BY count DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get division breakdown for date
   */
  private async getDivisionBreakdown(date: Date): Promise<Array<{
    division_code: string;
    division_name: string;
    total_employee: number;
    total_present: number;
    attendance_rate: number;
  }>> {
    const sql = `
      SELECT 
        d.division_code,
        d.division_name,
        s.total_employee,
        s.total_present,
        CASE 
          WHEN s.total_employee > 0 
          THEN CAST(s.total_present AS FLOAT) / s.total_employee * 100 
          ELSE 0 
        END AS attendance_rate
      FROM monitoring_daily_summary s
      JOIN mst_division d ON s.division_id = d.division_id
      WHERE s.summary_date = '${this.formatDate(date)}'
        AND s.division_id IS NOT NULL
      ORDER BY d.division_code
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(date: Date): Promise<Array<{
    activity_type: string;
    description: string;
    timestamp: Date;
  }>> {
    const sql = `
      SELECT TOP 10
        'IMPORT' AS activity_type,
        'Batch ' + batch_code + ' completed with ' + CAST(inserted_records AS NVARCHAR) + ' records' AS description,
        completed_at AS timestamp
      FROM import_batch
      WHERE completed_at >= '${this.formatDate(date)}'
        AND status = 'SUCCESS'
      ORDER BY completed_at DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get attendance trend (last N days)
   */
  async getAttendanceTrend(days: number = 7): Promise<Array<{
    date: Date;
    total_employee: number;
    total_present: number;
    attendance_rate: number;
  }>> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const sql = `
      SELECT 
        summary_date AS date,
        total_employee,
        total_present,
        CASE 
          WHEN total_employee > 0 
          THEN CAST(total_present AS FLOAT) / total_employee * 100 
          ELSE 0 
        END AS attendance_rate
      FROM monitoring_daily_summary
      WHERE summary_date >= '${this.formatDate(dateFrom)}'
        AND division_id IS NULL
        AND estate_id IS NULL
      ORDER BY summary_date DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get machine status overview
   */
  async getMachineStatus(): Promise<Array<{
    machine_code: string;
    machine_name: string;
    access_status: string;
    last_import?: Date;
    total_logs_today: number;
  }>> {
    const today = new Date();

    const sql = `
      SELECT 
        m.machine_code,
        m.machine_name,
        m.access_status,
        b.completed_at AS last_import,
        ISNULL(l.total_logs, 0) AS total_logs_today
      FROM mst_machine m
      LEFT JOIN (
        SELECT machine_id, MAX(completed_at) AS completed_at
        FROM import_batch
        WHERE status = 'SUCCESS'
        GROUP BY machine_id
      ) b ON m.machine_id = b.machine_id
      LEFT JOIN (
        SELECT machine_id, COUNT(*) AS total_logs
        FROM attendance_raw_log
        WHERE record_date = '${this.formatDate(today)}'
        GROUP BY machine_id
      ) l ON m.machine_id = l.machine_id
      WHERE m.is_active = 1
      ORDER BY m.machine_code
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Get employee attendance summary
   */
  async getEmployeeAttendanceSummary(
    empCode: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{
    emp_code: string;
    emp_name: string;
    total_days: number;
    present_days: number;
    absent_days: number;
    cuti_days: number;
    sakit_days: number;
    attendance_rate: number;
  }> {
    const sql = `
      SELECT 
        e.emp_code,
        e.emp_name,
        COUNT(*) AS total_days,
        SUM(CASE WHEN p.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
        SUM(CASE WHEN p.attendance_status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN p.is_cuti = 1 THEN 1 ELSE 0 END) AS cuti_days,
        SUM(CASE WHEN p.is_sakit = 1 THEN 1 ELSE 0 END) AS sakit_days,
        CASE 
          WHEN COUNT(*) > 0 
          THEN CAST(SUM(CASE WHEN p.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 
          ELSE 0 
        END AS attendance_rate
      FROM mst_employee e
      LEFT JOIN attendance_daily_process p 
        ON e.employee_id = p.employee_id
        AND p.work_date >= '${this.formatDate(dateFrom)}'
        AND p.work_date <= '${this.formatDate(dateTo)}'
      WHERE e.emp_code = '${empCode}'
      GROUP BY e.emp_code, e.emp_name
    `;

    const result = await this.sqlClient.query(sql);
    return result[0] || null;
  }

  /**
   * Get cross-division scan report for date
   */
  async getCrossDivisionScans(date: Date): Promise<Array<{
    work_date: Date;
    emp_code: string;
    emp_name: string;
    scan_division: string;
    home_division: string;
    final_division: string;
    machine_code: string;
    sorting_status: string;
    note: string;
  }>> {
    const sql = `
      SELECT
        r.work_date,
        r.emp_code,
        e.emp_name,
        scan_div.division_code AS scan_division,
        home_div.division_code AS home_division,
        final_div.division_code AS final_division,
        m.machine_code,
        r.sorting_status,
        r.match_status,
        r.note
      FROM attendance_division_reconcile r
      JOIN mst_employee e ON r.employee_id = e.employee_id
      LEFT JOIN mst_machine m ON r.source_machine_id = m.machine_id
      LEFT JOIN mst_division scan_div ON r.detected_division_id = scan_div.division_id
      LEFT JOIN mst_division home_div ON r.expected_division_id = home_div.division_id
      LEFT JOIN mst_division final_div ON r.final_division_id = final_div.division_id
      WHERE r.work_date = '${this.formatDate(date)}'
        AND r.is_cross_division_scan = 1
      ORDER BY r.emp_code
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
