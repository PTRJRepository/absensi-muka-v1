/**
 * Sync Orchestrator Service
 *
 * Orchestrates sync from ZKTeco machines to database
 * ZKTeco is the ONLY data source - no API fallback
 *
 * Architecture (2026-06-23):
 * - RAW DATA ONLY: attendance_scan_logs stores raw data, mapping done separately
 * - Uses mssql directly for attendance_scan_logs (rebinmas_absensi_monitoring)
 * - Uses sqlClient for machine_user_raw, employees (extend_db_ptrj)
 */

import { SqlClient } from '../../shared/database/sql-client';
import { MachineRepository } from '../machines/machine.repository';
import { MachineService } from '../machines/machine.service';
import { ImportJobService } from './import-job.service';
import { EmployeeMappingService } from '../employees/employee-mapping.service';
import { EmployeeRepository } from '../employees/employee.repository';
import { MachineTimeProfileService } from '../machines/machine-time-profile.service';
import { ZktecoService } from '../machines/zkteco.service';
import { getWibDateKey } from '../../shared/timezone';
import { pickAbsensiId } from '../../shared/absensi-id';
import { parseZktecoUserIdToEmployeeCode } from '../mapping/zkteco-employee-code-parser';
import { AttendanceProcessService } from '../attendance/attendance-process-import.service';
import {
  publishSyncStarted,
  publishSyncCompleted,
  publishSyncFailed,
  publishMachineOnline,
  publishMachineOffline,
} from '../../lib/realtime-emitter';

export interface SyncResult {
  success: boolean;
  machineCode?: string;
  batchId?: number;
  usersCount?: number;
  attendanceCount?: number;
  newRecordsInserted?: number;
  unmappedCount?: number;
  duration?: number;
  source: 'ZKTECO';
  error?: string;
  failureCategory?: string;
}

export interface SyncAllResult {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: SyncResult[];
}

export interface HealthCheckResult {
  machineCode: string;
  isOnline: boolean;
  latencyMs: number | null;
  error?: string;
}

export interface HealthCheckAllResult {
  total: number;
  online: number;
  offline: number;
  machines: HealthCheckResult[];
}

// ─── Attendance scan log insert (raw data only, no mapping) ──────────────────────
// Uses mssql directly because attendance_scan_logs is in rebinmas_absensi_monitoring
// (not extend_db_ptrj where sqlClient points)

type RawAttendanceRecord = {
  deviceUserId?: string | number;
  userSn?: string | number;
  recordTime?: string | Date;
  timestamp?: string | Date;
  time?: string | Date;
  ip?: string;
  type?: string | number;
  verifyType?: string | number;
  workCode?: string | number;
  name?: string | number;
  userName?: string | number;
  uid?: string | number;
  id?: string | number;
};

function insertRawScanLog(
  pool: any,
  batchId: number,
  machine: { machine_id: number; machine_code: string; ip_address: string; scanner_code?: number | null; loc_code?: string | null },
  att: RawAttendanceRecord,
  profile: { timezoneMode: string; offsetMinutes: number } | null
): { inserted: boolean } {
  const rawDeviceUserId = pickAbsensiId(att.deviceUserId, undefined, undefined, undefined);
  const rawUserSn = att.userSn == null ? null : String(att.userSn);
  const zktecoUserName =
    att.name == null && att.userName == null
      ? null
      : String(att.name ?? att.userName);
  const rawRecordTime = new Date(
    (att.recordTime ?? att.timestamp ?? att.time) as string | Date
  );
  const scanTime = Number.isNaN(rawRecordTime.getTime())
    ? new Date()
    : rawRecordTime;

  // Normalize to WIB based on machine timezone profile
  let finalScanTime = scanTime;
  let finalScanDate = getWibDateKey(scanTime);
  let correctionStatus = 'NOT_CHECKED';
  let offsetMinutes = 0;

  if (profile) {
    offsetMinutes = profile.offsetMinutes;
    if (profile.timezoneMode === 'UTC_SOURCE') {
      finalScanTime = new Date(scanTime.getTime() + profile.offsetMinutes * 60_000);
      finalScanDate = getWibDateKey(finalScanTime);
      correctionStatus = 'CORRECTED';
    } else if (profile.timezoneMode === 'WIB_SOURCE') {
      correctionStatus = 'SKIPPED_WIB_ALREADY';
    } else {
      correctionStatus = 'SKIPPED_UNKNOWN_PROFILE';
    }
  }

  // SSOT parser: parse raw_device_user_id → employee code at sync time
  const parsed = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawDeviceUserId,
    machineCode: machine.machine_code,
    machineLocCode: machine.loc_code,
    machineScannerCode: machine.scanner_code,
    zktecoUserName: zktecoUserName,
  });

  const req = pool.request()
    .input('machineId', pool.mssql.Int, machine.machine_id)
    .input('machineCode', machine.machine_code)
    .input('rawDeviceUserId', rawDeviceUserId)
    .input('rawUserSn', rawUserSn)
    .input('rawRecordTime', pool.mssql.DateTime2, rawRecordTime)
    .input('rawIp', machine.ip_address)
    .input('zktecoUserName', zktecoUserName)
    .input('scanTime', pool.mssql.DateTime2, finalScanTime)
    .input('scanDate', pool.mssql.Date, finalScanDate)
    .input('eventType', att.type == null ? null : String(att.type))
    .input('verifyType', att.verifyType == null ? null : String(att.verifyType))
    .input('workCode', att.workCode == null ? null : String(att.workCode))
    .input('batchId', pool.mssql.BigInt, batchId)
    .input('correctionStatus', correctionStatus)
    .input('offsetMinutes', pool.mssql.Int, offsetMinutes)
    .input('parsedEmployeeCode', parsed.parsedEmployeeCode)
    .input('parsedDivisionCode', parsed.locCode)
    .input('mappingStatus', parsed.allowAutoMap ? 'MAPPED' : 'NEED_REVIEW')
    .input('mappingReason', parsed.reason);

  req.query(`
    INSERT INTO attendance_scan_logs
      (machine_id, machine_code, raw_device_user_id, raw_user_sn,
       raw_record_time, raw_ip, zkteco_user_name,
       scan_time, scan_date, event_type, verify_type, work_code,
       sync_batch_id, mapping_status,
       parsed_employee_code, parsed_division_code, mapping_reason,
       time_correction_status, time_correction_offset_minutes)
    VALUES
      (@machineId, @machineCode, @rawDeviceUserId, @rawUserSn,
       @rawRecordTime, @rawIp, @zktecoUserName,
       @scanTime, @scanDate, @eventType, @verifyType, @workCode,
       @batchId, @mappingStatus,
       @parsedEmployeeCode, @parsedDivisionCode, @mappingReason,
       @correctionStatus, @offsetMinutes)
  `);

  return { inserted: true };
}

// ─── Service ────────────────────────────────────────────────────────────────────

export class SyncOrchestrator {
  private profileService = new MachineTimeProfileService();
  private attendanceProcessService = new AttendanceProcessService();

  constructor(
    private machineService: MachineService,
    private machineRepo: MachineRepository,
    private importJobService: ImportJobService,
    private employeeMappingService: EmployeeMappingService,
    private employeeRepo: EmployeeRepository,
    private sqlClient: SqlClient,
    // mssql pool for direct writes to attendance_scan_logs (rebinmas_absensi_monitoring)
    private mssqlPool?: any
  ) {}

  /**
   * Sync single machine - ZKTeco only, no API fallback
   */
  async syncMachine(machineCode: string): Promise<SyncResult> {
    const startTime = Date.now();
    publishSyncStarted(machineCode);

    const machine = await this.machineService.getMachineByCode(machineCode);
    if (!machine) {
      const error = `Machine not found: ${machineCode}`;
      publishSyncFailed(machineCode, error);
      return { success: false, machineCode, source: 'ZKTECO', error, failureCategory: 'NOT_FOUND' };
    }

    if (machine.access_status !== 'ACCESSIBLE' || machine.data_source !== 'DIRECT_ZKTECO') {
      const error = `Machine not accessible: ${machine.access_status}`;
      publishSyncFailed(machineCode, error);
      return { success: false, machineCode, source: 'ZKTECO', error, failureCategory: machine.access_status };
    }

    const result = await this.syncViaZkteco(machine);

    if (result.success) {
      const duration = Date.now() - startTime;
      publishSyncCompleted(machineCode, result.batchId ?? 0, {
        users: result.usersCount ?? 0,
        attendance: result.attendanceCount ?? 0,
        duration,
      });
      return { ...result, source: 'ZKTECO', duration };
    }

    publishSyncFailed(machineCode, result.error || 'Unknown error');
    return {
      success: false,
      machineCode,
      source: 'ZKTECO',
      error: result.error,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Sync all accessible machines
   */
  async syncAllMachines(): Promise<SyncAllResult> {
    const machines = await this.machineService.getAccessibleMachines();
    const results: SyncResult[] = [];
    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const machine of machines) {
      if (machine.access_status !== 'ACCESSIBLE') {
        skipped++;
        continue;
      }
      const result = await this.syncMachine(machine.machine_code);
      results.push(result);
      if (result.success) success++;
      else failed++;
    }

    return { total: machines.length, success, failed, skipped, results };
  }

  /**
   * Health check all machines
   */
  async healthCheckAllMachines(): Promise<HealthCheckAllResult> {
    const machines = await this.machineService.getAllMachines();
    const results: HealthCheckResult[] = [];
    let online = 0;
    let offline = 0;

    for (const machine of machines) {
      const result = await this.healthCheckMachine(machine.machine_code);
      results.push(result);
      if (result.isOnline) {
        online++;
        publishMachineOnline(machine.machine_code);
      } else {
        offline++;
        publishMachineOffline(machine.machine_code, result.error);
      }
    }

    return { total: machines.length, online, offline, machines: results };
  }

  /**
   * Health check single machine
   */
  async healthCheckMachine(machineCode: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const connInfo = await this.machineService.getMachineConnectionInfo(machineCode);
      if (!connInfo) {
        return { machineCode, isOnline: false, latencyMs: null, error: 'No connection info' };
      }

      const zkteco = new ZktecoService({
        machineCode,
        ipAddress: connInfo.ip,
        port: connInfo.port,
        timeoutMs: connInfo.timeout,
      });

      const result = await zkteco.connect();
      await zkteco.disconnect();

      return {
        machineCode,
        isOnline: result.success,
        latencyMs: result.success ? Date.now() - startTime : null,
        error: result.error?.message,
      };
    } catch (error: any) {
      return { machineCode, isOnline: false, latencyMs: null, error: error.message };
    }
  }

  /**
   * Sync via ZKTeco direct connection — RAW DATA ONLY, NO MAPPING
   */
  private async syncViaZkteco(machine: any): Promise<SyncResult> {
    try {
      const connInfo = await this.machineService.getMachineConnectionInfo(machine.machine_code);
      if (!connInfo) {
        return { success: false, source: 'ZKTECO', error: 'No connection info', failureCategory: 'NO_CONNECTION_INFO' };
      }

      // Create batch (Orchestrator uses import_job service → import_batch table)
      const batchId = await this.importJobService.createImportBatch({
        sync_job_id: undefined,
        source_type: 'DIRECT_MACHINE',
        machine_id: machine.machine_id,
        source_name: machine.machine_code,
        imported_by: 'SCHEDULER',
      });

      const zkteco = new ZktecoService({
        machineCode: machine.machine_code,
        ipAddress: connInfo.ip,
        port: connInfo.port,
        timeoutMs: connInfo.timeout,
      });

      // Connect
      const connectResult = await zkteco.connect();
      if (!connectResult.success) {
        await this.importJobService.completeBatch(batchId, 'FAILED', connectResult.error?.message);
        return {
          success: false, batchId, source: 'ZKTECO',
          error: `Connection: ${connectResult.error?.message}`,
          failureCategory: connectResult.error?.code,
        };
      }

      // Fetch users (enrollment data — useful for audit)
      const usersResult = await zkteco.fetchUsers();
      if (!usersResult.success) {
        await zkteco.disconnect();
        await this.importJobService.completeBatch(batchId, 'FAILED', usersResult.error?.message);
        return {
          success: false, batchId, source: 'ZKTECO',
          error: `Users: ${usersResult.error?.message}`,
          failureCategory: usersResult.error?.code,
        };
      }

      // Fetch attendance (raw data — stored without mapping)
      const attResult = await zkteco.fetchAttendanceRecords();
      if (!attResult.success) {
        await zkteco.disconnect();
        await this.importJobService.completeBatch(batchId, 'FAILED', attResult.error?.message);
        return {
          success: false, batchId, source: 'ZKTECO',
          error: `Attendance: ${attResult.error?.message}`,
          failureCategory: attResult.error?.code,
        };
      }

      await zkteco.disconnect();

      // ── Process users (machine enrollment — stored as-is) ──
      let usersCount = 0;
      let usersInserted = 0;
      const users = (usersResult.data || []) as any[];
      for (const user of users) {
        const rawUserId = pickAbsensiId(user.userId, user.id, user.uid, undefined);
        const userName = String(user.name ?? user.userName ?? '').trim();

        if (rawUserId) {
          await this.sqlClient.insert('machine_user_raw', {
            import_batch_id: batchId,
            machine_id: machine.machine_id,
            machine_uid: user.uid ?? null,
            machine_user_id: rawUserId,
            user_name: userName || null,
            role: user.role ?? null,
            card_no: user.cardno ?? user.cardNo ?? null,
            password_exists: Boolean(user.password),
            raw_payload: JSON.stringify(user),
          });
          usersInserted++;

          // Upsert employees table with machine data
          if (userName) {
            await this.employeeRepo.upsert({
              emp_code: rawUserId,
              emp_name: userName,
            });
            usersCount++;
          }
        }
      }

      // Get machine timezone profile BEFORE inserting records
      const machineProfile = await this.profileService.getActiveProfile(machine.machine_code);

      // ── Store attendance as RAW data (NO MAPPING HERE) ──
      if (!this.mssqlPool) {
        console.warn('[Orchestrator] mssql pool not configured — skipping attendance insert');
      } else {
        let attCount = 0;
        let newRecordsInserted = 0;
        const attendances = (attResult.data || []) as any[];
        for (const att of attendances) {
          const result = insertRawScanLog(this.mssqlPool, batchId, machine, att, machineProfile);
          attCount++;
          if (result.inserted) newRecordsInserted++;
        }
        console.log(`[Orchestrator] Stored ${attCount} raw attendance records (${newRecordsInserted} new)`);
      }

      // ── Enrich user names from machine_user_raw ──
      // After attendance insert, update zkteco_user_name from machine_user_raw
      if (this.mssqlPool && machine.machine_id) {
        try {
          const req = this.mssqlPool.request()
            .input('machineId', this.mssqlPool.mssql.Int, machine.machine_id)
            .input('syncTime', this.mssqlPool.mssql.DateTime2, new Date());
          await req.query(`
            UPDATE sl
            SET
                -- PRIORITY FIX: machine_user_raw is the AUTHORITY, not attendance record
                -- Previous COALESCE(attendance_name, machine_raw) was WRONG
                sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
                sl.zkteco_user_name_source = CASE
                    WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0
                    THEN 'MACHINE_USER_RAW'
                    WHEN sl.zkteco_user_name IS NOT NULL AND LEN(LTRIM(RTRIM(sl.zkteco_user_name))) > 0
                    THEN 'ATTENDANCE_RECORD'
                    ELSE 'UNKNOWN'
                END,
                sl.zkteco_user_name_synced_at = @syncTime,
                sl.zkteco_user_name_sync_status = CASE
                    WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0
                    THEN 'FILLED'
                    WHEN r.id IS NOT NULL AND (r.user_name IS NULL OR LEN(LTRIM(RTRIM(r.user_name))) = 0)
                    THEN 'EMPTY_RAW_USER_NAME'
                    ELSE 'NO_RAW_USER'
                END
            FROM attendance_scan_logs sl
            INNER JOIN machine_user_raw r
                ON r.machine_id = sl.machine_id AND r.machine_user_id = sl.raw_device_user_id
            WHERE sl.machine_id = @machineId
              AND sl.sync_batch_id = @batchId
          `);
          console.log(`[Orchestrator] Enriched user names from machine_user_raw`);
        } catch (enrichError: unknown) {
          const msg = enrichError instanceof Error ? enrichError.message : String(enrichError);
          console.warn(`[Orchestrator] Failed to enrich user names: ${msg}`);
        }

        // ── Enrich current_emp_code from employees (NIK resolution) ──
        try {
          const req2 = this.mssqlPool.request()
            .input('machineId', this.mssqlPool.mssql.Int, machine.machine_id)
            .input('batchId', this.mssqlPool.mssql.BigInt, batchId)
            .input('syncTime', this.mssqlPool.mssql.DateTime2, new Date());
          await req2.query(`
            UPDATE sl
            SET
                sl.current_emp_code = COALESCE(e_curr.employee_code, e_parsed.current_emp_code, e_parsed.employee_code),
                sl.current_employee_id = COALESCE(e_curr.id, e_parsed.id),
                sl.current_mapping_status = CASE
                    WHEN COALESCE(e_curr.id, e_parsed.id) IS NOT NULL THEN 'MAPPED'
                    ELSE 'NEED_REVIEW'
                END,
                sl.current_mapping_reason = CASE
                    WHEN e_curr.id IS NOT NULL THEN 'NIK_RESOLVED_VIA_CURRENT_EMP_CODE'
                    WHEN e_parsed.id IS NOT NULL THEN 'MAPPED_VIA_PARSED_EMPLOYEE_CODE'
                    ELSE 'PARSED_CODE_NOT_FOUND_IN_EMPLOYEES'
                END,
                sl.current_resolved_at = @syncTime
            FROM attendance_scan_logs sl
            LEFT JOIN employees e_parsed
                ON e_parsed.employee_code = sl.parsed_employee_code
            LEFT JOIN employees e_curr
                ON e_curr.employee_code = e_parsed.current_emp_code
                AND e_curr.is_active = 1
                AND e_curr.employee_code != ISNULL(e_parsed.employee_code, '')
            WHERE sl.machine_id = @machineId
              AND sl.sync_batch_id = @batchId
              AND sl.parsed_employee_code IS NOT NULL
              AND sl.parsed_employee_code != ''
          `);
          console.log(`[Orchestrator] Enriched current_emp_code from employees`);
        } catch (enrichError: unknown) {
          const msg = enrichError instanceof Error ? enrichError.message : String(enrichError);
          console.warn(`[Orchestrator] Failed to enrich current_emp_code: ${msg}`);
        }

        // ── Step 5: Process scan logs → attendance_imports ───────────────────────
        try {
          const procResult = await this.attendanceProcessService.processScanLogsForBatch(batchId);
          console.log(`[Orchestrator] Attendance imports: ${procResult.details?.mapped ?? 0} mapped, ${procResult.details?.manualReview ?? 0} manual_review`);
        } catch (procErr: unknown) {
          const msg = procErr instanceof Error ? procErr.message : String(procErr);
          console.warn(`[Orchestrator] Failed to process attendance imports: ${msg}`);
        }
      }

      await this.importJobService.completeBatch(batchId, 'SUCCESS');

      return {
        success: true,
        batchId,
        usersCount,
        attendanceCount: attResult.data?.length ?? 0,
        source: 'ZKTECO',
      };
    } catch (error: any) {
      return { success: false, source: 'ZKTECO', error: error.message, failureCategory: error?.code };
    }
  }
}
