/**
 * Direct ZKTeco Import Service
 *
 * Imports attendance logs and users directly from ZKTeco machines via node-zklib
 */

import { SqlClient } from '../../shared/database/sql-client';
import { MachineService } from '../machines/machine.service';
import { EmployeeMappingService } from '../employees/employee-mapping.service';
import { EmployeeRepository } from '../employees/employee.repository';
import { ImportJobService } from './import-job.service';
import { ZktecoService } from '../machines/zkteco.service';
import { ZktecoMachineConfig } from '../machines/zkteco.service';

export class DirectZKTecoImportService {
  constructor(
    private sqlClient: SqlClient,
    private machineService: MachineService,
    private mappingService: EmployeeMappingService,
    private employeeRepo: EmployeeRepository,
    private importJobService: ImportJobService
  ) {}

  /**
   * Import from single machine
   */
  async importFromMachine(
    machineCode: string,
    syncJobId?: number
  ): Promise<{
    success: boolean;
    batchId?: number;
    totalUsers: number;
    totalAttendance: number;
    error?: string;
  }> {
    const machine = await this.machineService.getMachineByCode(machineCode);
    if (!machine) {
      return { success: false, totalUsers: 0, totalAttendance: 0, error: 'Machine not found' };
    }

    // Create import batch
    const batchId = await this.importJobService.createImportBatch({
      sync_job_id: syncJobId,
      source_type: 'DIRECT_MACHINE',
      machine_id: machine.machine_id,
      source_name: machineCode,
      imported_by: 'SYSTEM',
    });

    try {
      // Get connection info
      const connInfo = await this.machineService.getMachineConnectionInfo(machineCode);
      if (!connInfo) {
        throw new Error('No connection info available');
      }

      // Connect to ZKTeco device (pseudo-code - actual implementation uses node-zklib)
      const { users, attendances } = await this.fetchFromZKTeco(
        connInfo.ip,
        connInfo.port,
        connInfo.timeout
      );

      // Import users
      await this.importUsers(batchId, machine.machine_id, users);

      // Import attendance logs
      await this.importAttendanceLogs(batchId, machine.machine_id, attendances);

      // Map device users to employees
      await this.mapDeviceUsersToEmployees(machine.machine_id, machineCode);

      // Complete batch
      await this.importJobService.completeBatch(batchId, 'SUCCESS');

      return {
        success: true,
        batchId,
        totalUsers: users.length,
        totalAttendance: attendances.length,
      };
    } catch (error: any) {
      await this.importJobService.completeBatch(batchId, 'FAILED', error.message);
      return {
        success: false,
        batchId,
        totalUsers: 0,
        totalAttendance: 0,
        error: error.message,
      };
    }
  }

  /**
   * Import from all accessible machines
   */
  async importFromAllMachines(): Promise<{
    syncJobId: number;
    totalMachines: number;
    successMachines: number;
    failedMachines: number;
  }> {
    // Create sync job
    const syncJobId = await this.importJobService.createSyncJob({
      sync_type: 'DIRECT_MACHINE',
      trigger_type: 'MANUAL',
      created_by: 'SYSTEM',
    });

    const machines = await this.machineService.getAccessibleMachines();
    let successCount = 0;
    let failedCount = 0;

    for (const machine of machines) {
      const result = await this.importFromMachine(machine.machine_code, syncJobId);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    // Complete sync job
    const status = failedCount === 0 ? 'SUCCESS' : successCount > 0 ? 'PARTIAL' : 'FAILED';
    await this.importJobService.completeSyncJob(syncJobId, status);

    return {
      syncJobId,
      totalMachines: machines.length,
      successMachines: successCount,
      failedMachines: failedCount,
    };
  }

  /**
   * Fetch data from ZKTeco device using ZktecoService
   */
  private async fetchFromZKTeco(
    ip: string,
    port: number,
    timeoutMs: number
  ): Promise<{
    users: any[];
    attendances: any[];
  }> {
    // Create ZKTeco service instance for this machine
    const config: ZktecoMachineConfig = {
      machineCode: '', // Not needed for fetch
      ipAddress: ip,
      port: port,
      timeoutMs: timeoutMs,
    };

    const zkteco = new ZktecoService(config);

    try {
      // Connect to device
      const connectResult = await zkteco.connect();
      if (!connectResult.success) {
        throw new Error(`ZKTeco connection failed: ${connectResult.error?.code} - ${connectResult.error?.message}`);
      }

      // Fetch users
      const usersResult = await zkteco.fetchUsers();
      if (!usersResult.success) {
        throw new Error(`ZKTeco fetch users failed: ${usersResult.error?.message}`);
      }

      // Fetch attendance records
      const attResult = await zkteco.fetchAttendanceRecords();
      if (!attResult.success) {
        throw new Error(`ZKTeco fetch attendances failed: ${attResult.error?.message}`);
      }

      return {
        users: (usersResult.data || []) as any[],
        attendances: (attResult.data || []) as any[],
      };
    } finally {
      // Always disconnect, even on error
      await zkteco.disconnect();
    }
  }

  /**
   * Import users to machine_user_raw
   */
  private async importUsers(
    batchId: number,
    machineId: number,
    users: any[]
  ): Promise<void> {
    const records = users.map((user) => ({
      import_batch_id: batchId,
      machine_id: machineId,
      machine_uid: user.uid,
      machine_user_id: user.userId,
      user_name: user.name,
      role: user.role,
      card_no: user.cardno,
      password_exists: !!user.password,
      raw_payload: JSON.stringify(user),
    }));

    if (records.length > 0) {
      await this.sqlClient.batchInsert('machine_user_raw', records);
    }

    await this.importJobService.updateBatchProgress(batchId, {
      total_records: users.length,
      inserted_records: users.length,
    });
  }

  /**
   * Import attendance logs to attendance_raw_log
   */
  private async importAttendanceLogs(
    batchId: number,
    machineId: number,
    attendances: any[]
  ): Promise<void> {
    const records = attendances.map((att) => ({
      import_batch_id: batchId,
      machine_id: machineId,
      machine_user_id: att.deviceUserId,
      record_time: new Date(att.recordTime),
      device_ip: att.ip,
      raw_payload: JSON.stringify(att),
      is_processed: false,
    }));

    if (records.length > 0) {
      // Insert in chunks of 1000 to avoid timeout
      const chunkSize = 1000;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        await this.sqlClient.batchInsert('attendance_raw_log', chunk);
      }
    }

    await this.importJobService.updateBatchProgress(batchId, {
      total_records: attendances.length,
      inserted_records: attendances.length,
    });
  }

  /**
   * Map device users to employees
   */
  private async mapDeviceUsersToEmployees(
    machineId: number,
    machineCode: string
  ): Promise<void> {
    // Get scanner code mapping
    const mapping = await this.machineService.getScannerCodeMapping(machineCode);

    // Get all device users from machine_user_raw
    const deviceUsers = await this.sqlClient.select<{ machine_user_id: string; user_name: string }>(
      'machine_user_raw',
      'machine_user_id, user_name',
      `machine_id = ${machineId}`
    );

    for (const deviceUser of deviceUsers) {
      // Convert deviceUserId to emp_code
      const result = await this.mappingService.convertDeviceUserIdToEmpCodeAsync(
        deviceUser.machine_user_id,
        mapping?.locCode,
        mapping?.scannerCode,
        machineCode
      );

      if (!result) continue;

      // Upsert employee
      const employeeId = await this.employeeRepo.upsert({
        emp_code: result.empCode,
        emp_name: deviceUser.user_name || result.empCode,
      });

      // Upsert mapping
      await this.mappingService.upsertMapping({
        machine_id: machineId,
        machine_user_id: deviceUser.machine_user_id,
        employee_id: employeeId,
        emp_code: result.empCode,
        mapped_by_rule: result.rule,
        loc_code: mapping?.locCode,
        scanner_code: mapping?.scannerCode,
        confidence_score: result.confidence,
      });
    }
  }
}
