/**
 * Attendance Process Service
 * 
 * Processes raw attendance logs into daily attendance records
 * Converts attendance_raw_log → attendance_daily_process + attendance_process_detail
 */

import { SqlClient } from '../../shared/database/sql-client';
import { AttendanceRawRepository } from './attendance-raw.repository';
import { EmployeeMovementService } from '../employees/employee-movement.service';

export interface AttendanceDailyProcess {
  process_id: number;
  employee_id: number;
  emp_code: string;
  emp_name: string;
  work_date: Date;
  final_division_id?: number;
  final_gang_id?: number;
  source_priority: string;
  first_scan_time?: Date;
  last_scan_time?: Date;
  jam_masuk?: string;
  jam_keluar?: string;
  scan_count: number;
  machine_count: number;
  has_machine_log: boolean;
  has_api_data: boolean;
  has_manual_adjustment: boolean;
  attendance_status: string;
  reconcile_status: string;
  is_locked: boolean;
  scan_division_id?: number;
  home_division_id?: number;
  is_cross_division_scan?: boolean;
  cross_division_note?: string;
  processed_at: Date;
  updated_at: Date;
}

export class AttendanceProcessService {
  constructor(
    private sqlClient: SqlClient,
    private rawRepo: AttendanceRawRepository,
    private movementService: EmployeeMovementService
  ) {}

  /**
   * Process unprocessed raw logs
   */
  async processUnprocessedLogs(batchSize: number = 1000): Promise<{
    processed: number;
    errors: number;
  }> {
    const rawLogs = await this.rawRepo.findUnprocessed(batchSize);
    let processed = 0;
    let errors = 0;

    // Group by emp_code + date
    const grouped = this.groupByEmployeeAndDate(rawLogs);

    for (const [key, logs] of grouped.entries()) {
      try {
        await this.processDailyAttendance(logs);
        
        // Mark as processed
        const logIds = logs.map(l => l.raw_log_id);
        await this.rawRepo.markAsProcessed(logIds);
        
        processed += logs.length;
      } catch (error) {
        console.error(`Error processing ${key}:`, error);
        errors += logs.length;
      }
    }

    return { processed, errors };
  }

  /**
   * Process daily attendance for single employee
   */
  async processDailyAttendance(rawLogs: any[]): Promise<void> {
    if (rawLogs.length === 0) return;

    const firstLog = rawLogs[0];
    const empCode = firstLog.emp_code;
    const workDate = new Date(firstLog.record_date);

    // Get employee info
    const employee = await this.sqlClient.select<{ employee_id: number; emp_name: string }>(
      'mst_employee',
      'employee_id, emp_name',
      `emp_code = '${empCode}'`
    );

    if (employee.length === 0) {
      throw new Error(`Employee not found: ${empCode}`);
    }

    const employeeId = employee[0].employee_id;
    const empName = employee[0].emp_name;

    // Get division for this date
    const divisionId = await this.movementService.getDivisionOnDate(employeeId, workDate);

    // Get scan and home division for cross-division detection
    const scanDivisionId = await this.getScanDivisionId(rawLogs);
    const homeDivisionId = await this.getHomeDivisionFromEmpCode(empCode);
    const isCrossDivision = scanDivisionId !== null && homeDivisionId !== null && scanDivisionId !== homeDivisionId;

    // Calculate attendance metrics
    const metrics = this.calculateAttendanceMetrics(rawLogs);

    // Check if daily process already exists
    const existing = await this.sqlClient.select<{ process_id: number }>(
      'attendance_daily_process',
      'process_id',
      `employee_id = ${employeeId} AND work_date = '${this.formatDate(workDate)}'`
    );

    let processId: number;

    if (existing.length > 0) {
      // Update existing
      processId = existing[0].process_id;
      await this.sqlClient.update(
        'attendance_daily_process',
        {
          first_scan_time: metrics.firstScan,
          last_scan_time: metrics.lastScan,
          jam_masuk: metrics.jamMasuk,
          jam_keluar: metrics.jamKeluar,
          scan_count: metrics.scanCount,
          machine_count: metrics.machineCount,
          has_machine_log: true,
          attendance_status: metrics.status,
          scan_division_id: scanDivisionId,
          home_division_id: homeDivisionId,
          is_cross_division_scan: isCrossDivision,
          cross_division_note: isCrossDivision
            ? `Scan di divisi ${scanDivisionId}, karyawan divisi ${homeDivisionId}`
            : null,
          updated_at: new Date(),
        },
        `process_id = ${processId}`
      );
    } else {
      // Insert new
      processId = await this.sqlClient.insert('attendance_daily_process', {
        employee_id: employeeId,
        emp_code: empCode,
        emp_name: empName,
        work_date: workDate,
        final_division_id: divisionId,
        source_priority: 'MACHINE',
        first_scan_time: metrics.firstScan,
        last_scan_time: metrics.lastScan,
        jam_masuk: metrics.jamMasuk,
        jam_keluar: metrics.jamKeluar,
        scan_count: metrics.scanCount,
        machine_count: metrics.machineCount,
        has_machine_log: true,
        has_api_data: false,
        has_manual_adjustment: false,
        attendance_status: metrics.status,
        reconcile_status: 'PENDING',
        is_locked: false,
        scan_division_id: scanDivisionId,
        home_division_id: homeDivisionId,
        is_cross_division_scan: isCrossDivision,
        cross_division_note: isCrossDivision
          ? `Scan di divisi ${scanDivisionId}, karyawan divisi ${homeDivisionId}`
          : null,
      });
    }

    // Insert process details
    await this.insertProcessDetails(processId, rawLogs);
  }

  /**
   * Calculate attendance metrics from raw logs
   */
  private calculateAttendanceMetrics(rawLogs: any[]): {
    firstScan: Date;
    lastScan: Date;
    jamMasuk: string;
    jamKeluar: string;
    scanCount: number;
    machineCount: number;
    status: string;
  } {
    const sortedLogs = rawLogs.sort((a, b) => 
      new Date(a.record_time).getTime() - new Date(b.record_time).getTime()
    );

    const firstScan = new Date(sortedLogs[0].record_time);
    const lastScan = new Date(sortedLogs[sortedLogs.length - 1].record_time);

    const jamMasuk = this.extractTime(firstScan);
    const jamKeluar = sortedLogs.length > 1 ? this.extractTime(lastScan) : null;

    const uniqueMachines = new Set(rawLogs.map(l => l.machine_id));

    // Determine status
    let status = 'PRESENT';
    if (!jamKeluar) {
      status = 'NO_CHECKOUT';
    } else if (sortedLogs.length < 2) {
      status = 'INCOMPLETE_SCAN';
    }

    return {
      firstScan,
      lastScan,
      jamMasuk,
      jamKeluar: jamKeluar || '',
      scanCount: rawLogs.length,
      machineCount: uniqueMachines.size,
      status,
    };
  }

  /**
   * Insert process details
   */
  private async insertProcessDetails(processId: number, rawLogs: any[]): Promise<void> {
    const sortedLogs = rawLogs.sort((a, b) => 
      new Date(a.record_time).getTime() - new Date(b.record_time).getTime()
    );

    const details = sortedLogs.map((log, index) => ({
      process_id: processId,
      raw_log_id: log.raw_log_id,
      machine_id: log.machine_id,
      scan_time: log.record_time,
      scan_type: index === 0 ? 'IN' : index === sortedLogs.length - 1 ? 'OUT' : 'MIDDLE',
      is_used_for_in: index === 0,
      is_used_for_out: index === sortedLogs.length - 1,
      is_duplicate: false,
      is_cross_division: false,
    }));

    if (details.length > 0) {
      await this.sqlClient.batchInsert('attendance_process_detail', details);
    }
  }

  /**
   * Group raw logs by employee and date
   */
  private groupByEmployeeAndDate(rawLogs: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const log of rawLogs) {
      const key = `${log.emp_code}_${log.record_date}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(log);
    }

    return grouped;
  }

  /**
   * Extract time from datetime (HH:MM:SS format)
   */
  private extractTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get scan division from raw logs (machine's default division)
   */
  private async getScanDivisionId(rawLogs: any[]): Promise<number | null> {
    if (rawLogs.length === 0) return null;
    const machineId = rawLogs[0].machine_id;
    const result = await this.sqlClient.select<{ default_division_id: number }>(
      'mst_machine',
      'default_division_id',
      `machine_id = ${machineId}`
    );
    return result[0]?.default_division_id || null;
  }

  /**
   * Get home division from emp_code prefix -> loc_code mapping
   */
  private async getHomeDivisionFromEmpCode(empCode: string): Promise<number | null> {
    // Handle empty or null emp_code
    if (!empCode || empCode.trim() === '') {
      console.warn('[attendance-process] getHomeDivisionFromEmpCode: Empty emp_code provided');
      return null;
    }

    const locCode = empCode.charAt(0).toUpperCase();

    // Validate locCode is a valid letter
    if (!/^[A-Z]$/.test(locCode)) {
      console.warn(`[attendance-process] getHomeDivisionFromEmpCode: Invalid locCode "${locCode}" from emp_code "${empCode}"`);
      return null;
    }

    try {
      const result = await this.sqlClient.select<{ division_id: number }>(
        'mst_division',
        'division_id',
        `loc_code = '${locCode}'`
      );
      return result[0]?.division_id || null;
    } catch (err) {
      console.error(`[attendance-process] getHomeDivisionFromEmpCode: Error querying division for locCode "${locCode}":`, err);
      return null;
    }
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
