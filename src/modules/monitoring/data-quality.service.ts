/**
 * @deprecated 2026-06-26 — DEAD CODE. No route mounts this service.
 *
 * Depends on AttendanceRawRepository which queries DROPPED tables
 * (attendance_raw_log, mst_machine, machine_user_map). Every method 500s.
 * Live data quality lives in src/api/routes/quality.routes.ts (queries
 * employees + attendance_scan_logs directly).
 *
 * Retained for git history only.
 *
 * Data Quality Service
 *
 * Provides comprehensive data quality checks for attendance data
 * Part of Phase 2: Data Quality
 */

import { SqlClient } from '../../shared/database/sql-client';
import { AttendanceRawRepository } from '../attendance/attendance-raw.repository';

export interface QualityCheckResult {
  check_name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  record_count: number;
  details: string;
  items?: any[];
  recommendation?: string;
}

export interface DataQualityReport {
  generated_at: Date;
  date_range?: { from: Date; to: Date };
  overall_status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  total_issues: number;
  checks: QualityCheckResult[];
}

export class DataQualityService {
  constructor(
    private sqlClient: SqlClient,
    private rawRepo: AttendanceRawRepository
  ) {}

  /**
   * Run all data quality checks
   */
  async runAllChecks(dateFrom?: Date, dateTo?: Date): Promise<DataQualityReport> {
    const checks: QualityCheckResult[] = [];

    // 1. Unmapped device users
    checks.push(await this.checkUnmappedEmployees());

    // 2. Duplicate scans
    checks.push(await this.checkDuplicateScans());

    // 3. Machine time drift
    checks.push(await this.checkMachineTimeDrift());

    // 4. Unprocessed logs
    checks.push(await this.checkUnprocessedLogs());

    // 5. Machine coverage (machines without recent data)
    checks.push(await this.checkMachineCoverage(dateFrom, dateTo));

    // Calculate overall status
    const criticalCount = checks.filter(c => c.severity === 'CRITICAL').length;
    const highCount = checks.filter(c => c.severity === 'HIGH').length;
    const warnCount = checks.filter(c => c.severity === 'MEDIUM' || c.severity === 'LOW').length;

    let overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (criticalCount > 0) overallStatus = 'CRITICAL';
    else if (highCount > 0 || warnCount > 2) overallStatus = 'WARNING';

    return {
      generated_at: new Date(),
      date_range: dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined,
      overall_status: overallStatus,
      total_issues: checks.reduce((sum, c) => sum + c.record_count, 0),
      checks,
    };
  }

  /**
   * Check 1: Unmapped device users
   * Detects attendance records from unknown device user IDs
   */
  async checkUnmappedEmployees(): Promise<QualityCheckResult> {
    try {
      const unmapped = await this.rawRepo.getUnmappedDeviceUsers();
      const criticalUnmapped = unmapped.filter(u => u.total_scans > 100);
      const highUnmapped = unmapped.filter(u => u.total_scans > 10 && u.total_scans <= 100);

      let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'INFO';
      let details = `${unmapped.length} unmapped device user IDs found`;

      if (criticalUnmapped.length > 0) {
        status = 'FAIL';
        severity = 'CRITICAL';
        details += ` (${criticalUnmapped.length} with >100 scans are critical)`;
      } else if (highUnmapped.length > 0) {
        status = 'WARN';
        severity = 'HIGH';
        details += ` (${highUnmapped.length} with >10 scans)`;
      } else if (unmapped.length > 0) {
        status = 'WARN';
        severity = 'LOW';
      }

      return {
        check_name: 'UNMAPPED_EMPLOYEES',
        status,
        severity,
        record_count: unmapped.length,
        details,
        items: unmapped.slice(0, 20), // Top 20
        recommendation: unmapped.length > 0
          ? 'Review unmapped device users and add to employee mapping or exclude from reports'
          : undefined,
      };
    } catch (error: any) {
      return {
        check_name: 'UNMAPPED_EMPLOYEES',
        status: 'FAIL',
        severity: 'HIGH',
        record_count: 0,
        details: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * Check 2: Duplicate scans
   * Detects multiple scans from same user at same time on same machine
   */
  async checkDuplicateScans(): Promise<QualityCheckResult> {
    try {
      const duplicates = await this.rawRepo.getDuplicateScans(100);
      const totalDuplicates = duplicates.reduce((sum, d) => sum + (d.duplicate_count - 1), 0);

      let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'INFO';
      let details = `${duplicates.length} duplicate scan groups found (${totalDuplicates} extra records)`;

      if (totalDuplicates > 1000) {
        status = 'FAIL';
        severity = 'HIGH';
      } else if (totalDuplicates > 100) {
        status = 'WARN';
        severity = 'MEDIUM';
      } else if (duplicates.length > 0) {
        status = 'WARN';
        severity = 'LOW';
      }

      return {
        check_name: 'DUPLICATE_SCANS',
        status,
        severity,
        record_count: totalDuplicates,
        details,
        items: duplicates.slice(0, 20),
        recommendation: totalDuplicates > 0
          ? 'Run deduplication to clean up duplicate records'
          : undefined,
      };
    } catch (error: any) {
      return {
        check_name: 'DUPLICATE_SCANS',
        status: 'FAIL',
        severity: 'HIGH',
        record_count: 0,
        details: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * Check 3: Machine time drift
   * Detects machines with clock drift > 5 minutes
   */
  async checkMachineTimeDrift(): Promise<QualityCheckResult> {
    try {
      const drifts = await this.rawRepo.getAllMachineTimeDrift(10);
      const outOfSync = drifts.filter(d => !d.is_within_tolerance);

      let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'INFO';
      let details = `${drifts.length} machines checked`;

      if (outOfSync.length > 0) {
        status = 'WARN';
        severity = 'MEDIUM';
        details += ` (${outOfSync.length} machines with time drift > 5 minutes)`;
      }

      const items = drifts.map(d => ({
        machine_code: d.machine_code,
        drift_minutes: Math.round(d.max_drift_seconds / 60),
        direction: d.drift_direction,
        status: d.is_within_tolerance ? 'OK' : 'DRIFT',
      }));

      return {
        check_name: 'MACHINE_TIME_DRIFT',
        status,
        severity,
        record_count: outOfSync.length,
        details,
        items,
        recommendation: outOfSync.length > 0
          ? 'Contact IT to sync machine clocks - time drift affects attendance accuracy'
          : undefined,
      };
    } catch (error: any) {
      return {
        check_name: 'MACHINE_TIME_DRIFT',
        status: 'FAIL',
        severity: 'HIGH',
        record_count: 0,
        details: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * Check 4: Unprocessed logs
   * Detects raw logs that haven't been processed
   */
  async checkUnprocessedLogs(): Promise<QualityCheckResult> {
    try {
      const stats = await this.rawRepo.getProcessingStats();
      const unprocessedPercent = stats.total_logs > 0
        ? (stats.unprocessed_logs / stats.total_logs) * 100
        : 0;

      let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'INFO';
      let details = `${stats.unprocessed_logs} unprocessed of ${stats.total_logs} total (${unprocessedPercent.toFixed(1)}%)`;

      if (stats.unprocessed_logs > 10000 || unprocessedPercent > 50) {
        status = 'FAIL';
        severity = 'HIGH';
      } else if (stats.unprocessed_logs > 1000 || unprocessedPercent > 20) {
        status = 'WARN';
        severity = 'MEDIUM';
      }

      return {
        check_name: 'UNPROCESSED_LOGS',
        status,
        severity,
        record_count: stats.unprocessed_logs,
        details,
        recommendation: stats.unprocessed_logs > 0
          ? 'Run attendance processing job to clear backlog'
          : undefined,
      };
    } catch (error: any) {
      return {
        check_name: 'UNPROCESSED_LOGS',
        status: 'FAIL',
        severity: 'HIGH',
        record_count: 0,
        details: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * Check 5: Machine coverage
   * Detects machines without data in recent period
   */
  async checkMachineCoverage(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<QualityCheckResult> {
    try {
      const to = dateTo || new Date();
      const from = dateFrom || new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      const sql = `
        SELECT
          m.machine_code,
          m.access_status,
          COUNT(l.raw_log_id) AS scan_count,
          MAX(l.record_time) AS last_scan
        FROM attendance_machines m
        LEFT JOIN attendance_raw_log l
          ON m.machine_id = l.machine_id
          AND l.record_time >= '${from.toISOString().split('T')[0]}'
          AND l.record_time <= '${to.toISOString().split('T')[0]}'
        WHERE m.is_active = 1
        GROUP BY m.machine_code, m.access_status
        ORDER BY scan_count ASC
      `;

      const machines = await this.sqlClient.query(sql);
      const inactiveMachines = machines.filter(m =>
        m.access_status === 'ACCESSIBLE' && (m.scan_count === 0 || m.last_scan === null)
      );

      let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'INFO';

      if (inactiveMachines.length > 0) {
        status = 'WARN';
        severity = 'MEDIUM';
      }

      return {
        check_name: 'MACHINE_COVERAGE',
        status,
        severity,
        record_count: inactiveMachines.length,
        details: `${inactiveMachines.length} accessible machines without recent data`,
        items: machines.map(m => ({
          machine_code: m.machine_code,
          access_status: m.access_status,
          scan_count: m.scan_count,
          last_scan: m.last_scan,
          status: m.scan_count === 0 ? 'NO_DATA' : 'OK',
        })),
        recommendation: inactiveMachines.length > 0
          ? 'Check network/firewall for machines without data'
          : undefined,
      };
    } catch (error: any) {
      return {
        check_name: 'MACHINE_COVERAGE',
        status: 'FAIL',
        severity: 'HIGH',
        record_count: 0,
        details: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * Auto-fix common issues
   */
  async autoFix(issueType: 'duplicates'): Promise<{ fixed: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;

    if (issueType === 'duplicates') {
      try {
        const duplicates = await this.rawRepo.getDuplicateScans(1000);
        for (const dup of duplicates) {
          try {
            // Keep the first record (lowest log_id)
            await this.rawRepo.deleteDuplicateScans(
              dup.machine_code,
              dup.machine_user_id,
              new Date(dup.record_time),
              dup.first_log_id
            );
            fixed += dup.duplicate_count - 1;
          } catch (e: any) {
            errors.push(`Failed to delete duplicate: ${e.message}`);
          }
        }
      } catch (e: any) {
        errors.push(`Failed to get duplicates: ${e.message}`);
      }
    }

    return { fixed, errors };
  }
}
