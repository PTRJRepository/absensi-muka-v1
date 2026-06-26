import fs from 'fs';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';
// @ts-ignore - node-zklib has no local types
import ZKLib from 'node-zklib';
import { getWibDateKey } from '../shared/timezone';
import { pickAbsensiId } from '../shared/absensi-id';
import { parseZktecoUserIdToEmployeeCode } from '../modules/mapping/zkteco-employee-code-parser';
import { attendanceProcessService } from '../modules/attendance/attendance-process-import.service';

process.on('unhandledRejection', (error) => {
  console.error('[UnhandledRejection]', formatErrorMessage(error));
});

// ─── Types ────────────────────────────────────────────────────────────────────

type MachineRow = {
  id: number;
  machine_code: string;
  ip_address: string;
  port: number;
  scanner_code: number | null;
  loc_code: string | null;
  access_status: string;
  data_source: string;
};

type AttendanceRecord = {
  deviceUserId?: string | number;
  userSn?: string | number;
  recordTime?: string | Date;
  ip?: string;
  type?: string | number;
  verifyType?: string | number;
  workCode?: string | number;
  name?: string | number;
  userName?: string | number;
  uid?: string | number;
  id?: string | number;
  [key: string]: unknown;
};

type SyncMachineResult = {
  machine: string;
  status: string;
  rawCount: number;
  newRecordsInserted: number;
  errorMessage: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function arg(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const flagIndex = process.argv.indexOf(`--${name}`);
  return flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
}

function dbConfig() {
  return {
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
  };
}

async function connectDb() {
  return mssql.connect(dbConfig());
}

function safeBatchCode(value: string) {
  return value.replace(/[:.]/g, '-').slice(0, 60);
}

function accessStatusForFailure(category: string | null) {
  if (category === 'NETWORK_UNREACHABLE') return 'NETWORK_UNREACHABLE';
  if (category === 'TIMEOUT') return 'PORT_FORWARDING_NEEDED';
  if (category === 'CONNECTION_REFUSED') return 'PORT_FORWARDING_NEEDED';
  if (category === 'NOT_ZKTECO_DEVICE') return 'NOT_ZKTECO';
  return 'PORT_FORWARDING_NEEDED';
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ─── Upsert machine user to machine_user_raw ────────────────────────────────

async function upsertMachineUser(
  pool: any,
  machine: MachineRow,
  batchId: number,
  user: any
): Promise<void> {
  const rawUserId = pickAbsensiId(
    user.userId,
    user.id,
    user.uid,
    undefined
  );
  if (!rawUserId) return;

  const userName = String(user.name ?? user.userName ?? '').trim() || null;

  await pool.request()
    .input('machineId', mssql.Int, machine.id)
    .input('machineUid', user.uid ?? null)
    .input('machineUserId', rawUserId)
    .input('userName', userName)
    .input('machineRawUserName', userName)
    .input('role', user.role ?? null)
    .input('cardNo', user.cardno ?? user.cardNo ?? null)
    .input('passwordExists', user.password ? 1 : 0)
    .input('rawPayload', JSON.stringify(user))
    .query(`
      IF EXISTS (
        SELECT 1 FROM machine_user_raw
        WHERE machine_id = @machineId AND machine_user_id = @machineUserId
      )
      BEGIN
        UPDATE machine_user_raw
        SET machine_uid = @machineUid,
            user_name = @userName,
            machine_raw_user_name = @machineRawUserName,
            role = @role,
            card_no = @cardNo,
            password_exists = @passwordExists,
            raw_payload = @rawPayload,
            last_seen_at = GETDATE()
        WHERE machine_id = @machineId AND machine_user_id = @machineUserId;
      END
      ELSE
      BEGIN
        INSERT INTO machine_user_raw
          (machine_id, machine_uid, machine_user_id,
           user_name, machine_raw_user_name, role, card_no, password_exists,
           raw_payload, first_seen_at, last_seen_at, imported_at)
        VALUES
          (@machineId, @machineUid, @machineUserId,
           @userName, @machineRawUserName, @role, @cardNo, @passwordExists,
           @rawPayload, GETDATE(), GETDATE(), GETDATE());
      END
    `);
}

// ─── Enrich user names after attendance insert ──────────────────────────────

async function enrichUserNames(pool: any, machineId: number, batchId: number): Promise<void> {
  await pool.request()
    .input('machineId', mssql.Int, machineId)
    .input('batchId', mssql.BigInt, batchId)
    .input('syncTime', mssql.DateTime2, new Date())
    .query(`
      UPDATE sl
      SET
          sl.zkteco_user_name = COALESCE(
              NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''),
              LTRIM(RTRIM(r.user_name))
          ),
          sl.zkteco_user_name_source = CASE
              WHEN sl.zkteco_user_name IS NOT NULL AND LTRIM(RTRIM(sl.zkteco_user_name)) <> ''
              THEN 'ATTENDANCE_RECORD'
              ELSE 'MACHINE_USER_RAW'
          END,
          sl.zkteco_user_name_synced_at = @syncTime,
          sl.zkteco_user_name_sync_status = CASE
              WHEN r.machine_user_raw_id IS NOT NULL
                   AND r.user_name IS NOT NULL
                   AND LEN(LTRIM(RTRIM(r.user_name))) > 0
              THEN 'FILLED'
              WHEN r.machine_user_raw_id IS NOT NULL
                   AND (r.user_name IS NULL OR LEN(LTRIM(RTRIM(r.user_name))) = 0)
              THEN 'EMPTY_RAW_USER_NAME'
              ELSE 'NO_RAW_USER'
          END
      FROM attendance_scan_logs sl
      LEFT JOIN machine_user_raw r
          ON r.machine_id = sl.machine_id AND r.machine_user_id = sl.raw_device_user_id
      WHERE sl.machine_id = @machineId
        AND sl.sync_batch_id = @batchId
    `);
}



function normalizeRecord(record: AttendanceRecord, machine: MachineRow) {
  const rawDeviceUserId = pickAbsensiId(
    record.deviceUserId,
    record.userId,
    record.uid,
    record.id
  );
  const rawUserSn = record.userSn == null ? null : String(record.userSn);
  const zktecoUserName =
    record.name == null && record.userName == null
      ? null
      : String(record.name ?? record.userName);
  const rawRecordTime = new Date(
    (record.recordTime ?? record.timestamp ?? record.time) as string | Date
  );
  const scanTime = Number.isNaN(rawRecordTime.getTime())
    ? new Date()
    : rawRecordTime;
  const scanDate = getWibDateKey(scanTime);

  // SSOT parser: parse raw_device_user_id → employee code at sync time
  const parsed = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawDeviceUserId,
    machineCode: machine.machine_code,
    machineLocCode: machine.loc_code,
    machineScannerCode: machine.scanner_code,
    zktecoUserName: zktecoUserName,
  });

  return {
    rawDeviceUserId,
    rawUserSn,
    zktecoUserName,
    scanTime,
    scanDate,
    eventType: record.type == null ? null : String(record.type),
    verifyType: record.verifyType == null ? null : String(record.verifyType),
    workCode: record.workCode == null ? null : String(record.workCode),
    parsedEmployeeCode: parsed.parsedEmployeeCode,
    parsedDivisionCode: parsed.locCode,
    mappingStatus: parsed.allowAutoMap ? 'MAPPED' : 'NEED_REVIEW',
    mappingReason: parsed.reason,
  };
}

// ─── Insert raw scan log with SSOT parser ──────────────────────────────────────
// KEY: Dedup by (machine_code, raw_device_user_id, raw_record_time)
// IF NOT EXISTS prevents UNIQUE constraint violations from being thrown.
// This makes the insert truly idempotent — safe to call repeatedly.
// parsed_employee_code, parsed_division_code, mapping_status, mapping_reason
// are populated at sync time via the SSOT parser (zkteco-employee-code-parser.ts).

async function insertRawScan(
  pool: any,
  machine: MachineRow,
  batchId: number,
  record: AttendanceRecord
): Promise<{ inserted: boolean; scanDate: string }> {
  const n = normalizeRecord(record, machine);

  // Skip records with no user ID (can't be uniquely identified)
  if (!n.rawDeviceUserId || n.rawDeviceUserId.trim() === '') {
    return { inserted: false, scanDate: n.scanDate };
  }

  const result = await pool.request()
    .input('machineId', mssql.Int, machine.id)
    .input('machineCode', machine.machine_code)
    .input('rawDeviceUserId', n.rawDeviceUserId)
    .input('rawUserSn', n.rawUserSn)
    .input('rawRecordTime', mssql.DateTime2, n.scanTime)
    .input('rawIp', machine.ip_address)
    .input('zktecoUserName', n.zktecoUserName)
    .input('scanTime', mssql.DateTime2, n.scanTime)
    .input('scanDate', n.scanDate)
    .input('eventType', n.eventType)
    .input('verifyType', n.verifyType)
    .input('workCode', n.workCode)
    .input('batchId', mssql.BigInt, batchId)
    .input('parsedEmployeeCode', n.parsedEmployeeCode)
    .input('parsedDivisionCode', n.parsedDivisionCode)
    .input('mappingStatus', n.mappingStatus)
    .input('mappingReason', n.mappingReason)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM attendance_scan_logs
        WHERE machine_code = @machineCode
          AND raw_device_user_id = @rawDeviceUserId
          AND raw_record_time = @rawRecordTime
      )
      INSERT INTO attendance_scan_logs
        (machine_id, machine_code, raw_device_user_id, raw_user_sn,
         raw_record_time, raw_ip, zkteco_user_name,
         scan_time, scan_date, event_type, verify_type, work_code,
         sync_batch_id, mapping_status,
         parsed_employee_code, parsed_division_code, mapping_reason)
      VALUES
        (@machineId, @machineCode, @rawDeviceUserId, @rawUserSn,
         @rawRecordTime, @rawIp, @zktecoUserName,
         @scanTime, @scanDate, @eventType, @verifyType, @workCode,
         @batchId, @mappingStatus,
         @parsedEmployeeCode, @parsedDivisionCode, @mappingReason)
    `);

  return {
    inserted: (result.rowsAffected?.[0] ?? 0) > 0,
    scanDate: n.scanDate,
  };
}

// ─── Batch record ───────────────────────────────────────────────────────────────

async function createBatch(
  pool: any,
  machine: MachineRow,
  batchCodeOverride?: string
) {
  const batchCode = safeBatchCode(
    batchCodeOverride ?? `${machine.machine_code}-${new Date().toISOString()}`
  );
  const result = await pool
    .request()
    .input('batchCode', batchCode)
    .input('machineId', machine.id)
    .input('source', machine.data_source)
    .query(`
      INSERT INTO attendance_import_batches
        (batch_code, source, machine_id, status, started_at, records_total, records_success, records_failed)
      OUTPUT INSERTED.id
      VALUES (@batchCode, @source, @machineId, 'RUNNING', GETDATE(), 0, 0, 0)
    `);
  return { batchId: Number(result.recordset[0].id), batchCode };
}

// ─── ZKTeco connection ─────────────────────────────────────────────────────────

async function connectZkteco(
  ip: string,
  port: number,
  password: string,
  timeoutMs: number
) {
  return new Promise<any>((resolve, reject) => {
    const zk = new (ZKLib as any)(ip, port, timeoutMs, 4000, password);
    let settled = false;
    zk.createSocket(
      (err: any) => {
        if (err && !settled) {
          settled = true;
          reject(new Error(err));
        }
      },
      () => {} // close callback — ignore
    );
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(zk);
      }
    }, 1500);
  });
}

// ─── Sync single machine ────────────────────────────────────────────────────────
// RAW DATA ONLY — NO MAPPING IN THIS STEP
// READ-ONLY on ZKTeco device — never deletes/clears data

async function syncMachine(
  pool: any,
  machine: MachineRow,
  batchCodeOverride?: string
): Promise<SyncMachineResult | undefined> {
  const started = Date.now();
  const { batchId } = await createBatch(pool, machine, batchCodeOverride);
  let status = 'FAILED';
  let failureCategory: string | null = null;
  let errorMessage: string | null = null;
  let rawCount = 0;
  let newRecordsInserted = 0;

  try {
    if (machine.data_source !== 'DIRECT_ZKTECO') {
      throw new Error(`Machine skipped: ${machine.access_status}/${machine.data_source}`);
    }

    // Connect to ZKTeco — READ ONLY, no data cleared from machine
    let zk: any;
    try {
      zk = await connectZkteco(
        machine.ip_address,
        machine.port,
        process.env.ZKTECO_PASSWORD ?? '12345',
        Number(process.env.ZKTECO_TIMEOUT_MS ?? 30000)
      );
    } catch (zkErr: any) {
      console.error(`[ZKError] ${machine.ip_address}: ${formatErrorMessage(zkErr)}`);
      errorMessage = formatErrorMessage(zkErr);
      failureCategory = 'CONNECTION_REFUSED';
      throw new Error(errorMessage ?? 'ZKTeco connection failed');
    }

    // ── Step 1: Fetch users FIRST → machine_user_raw ─────────────────────────
    let usersCount = 0;
    try {
      const usersResponse = await zk.getUsers();
      const users = usersResponse?.data ?? usersResponse ?? [];
      console.log(`  Fetched ${users.length} enrolled users from ${machine.machine_code}`);
      for (const user of users) {
        await upsertMachineUser(pool, machine, batchId, user);
        usersCount++;
      }
      console.log(`  Upserted ${usersCount} users to machine_user_raw`);
    } catch (zkErr: any) {
      console.warn(`  [ZKUsers] ${machine.ip_address}: Failed to fetch users: ${formatErrorMessage(zkErr)}`);
      // Non-fatal: continue with attendance sync even if users fail
    }

    // ── Step 2: Fetch attendance SECOND ─────────────────────────────────────
    let records: AttendanceRecord[] = [];
    try {
      // NOTE: getAttendances() is READ-ONLY — data stays on machine
      const response = await zk.getAttendances();
      records = response?.data ?? response ?? [];
    } catch (zkErr: any) {
      console.error(`[ZKError] ${machine.ip_address}: ${formatErrorMessage(zkErr)}`);
      errorMessage = formatErrorMessage(zkErr);
      failureCategory = 'UNKNOWN_ERROR';
      throw new Error(errorMessage);
    } finally {
      try {
        await zk.enableDevice?.();
      } catch {}
    }

// NOTE: insertRawScan uses IF NOT EXISTS — UNIQUE constraint is backup safeguard.

    // Store every record as raw data — dedup via IF NOT EXISTS
    for (const record of records) {
      const result = await insertRawScan(pool, machine, batchId, record);
      rawCount++;
      if (result.inserted) newRecordsInserted++;
    }

    try {
      await zk.disconnect();
    } catch {}

    // ── Step 3: Enrich user names from machine_user_raw ────────────────────────
    if (newRecordsInserted > 0) {
      try {
        await enrichUserNames(pool, machine.id, batchId);
        console.log(`  Enriched ${newRecordsInserted} records with user names from machine_user_raw`);
      } catch (enrichErr: any) {
        console.warn(`  [Enrich] Failed to enrich user names: ${formatErrorMessage(enrichErr)}`);
      }

      // ── Step 4: Enrich current_emp_code from employees (NIK resolution) ────
      try {
        await pool.request()
          .input('machineId', mssql.Int, machine.id)
          .input('batchId', mssql.BigInt, batchId)
          .input('syncTime', mssql.DateTime2, new Date())
          .query(`
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
        console.log(`  Enriched current_emp_code for new records`);
      } catch (enrichErr: any) {
        console.warn(`  [Enrich] Failed to enrich current_emp_code: ${formatErrorMessage(enrichErr)}`);
      }

      // ── Step 5: Process scan logs → attendance_imports ───────────────────────
      // This populates attendance_imports with the new records, including enrichment columns.
      try {
        const procResult = await attendanceProcessService.processScanLogsForBatch(batchId);
        console.log(`  Attendance imports: ${procResult.details?.mapped ?? 0} mapped, ${procResult.details?.manualReview ?? 0} manual_review`);
      } catch (procErr: any) {
        console.warn(`  [AttendanceProcess] Failed: ${formatErrorMessage(procErr)}`);
      }
    }

    status = 'SUCCESS';
    await pool
      .request()
      .input('machineId', mssql.Int, machine.id)
      .input('lastSyncAt', mssql.DateTime2, new Date())
      .query(`
        UPDATE attendance_machines
        SET last_sync_at = @lastSyncAt,
            access_status = 'ACCESSIBLE',
            last_error_message = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @machineId
      `);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errorMessage = msg;
    if (!failureCategory) {
      if (msg.includes('refused')) failureCategory = 'CONNECTION_REFUSED';
      else if (msg.toLowerCase().includes('timeout'))
        failureCategory = 'TIMEOUT';
      else if (msg.includes('skipped')) failureCategory = machine.access_status;
      else failureCategory = 'UNKNOWN_ERROR';
    }
  }

  const durationMs = Date.now() - started;

  // Update batch record
  await pool
    .request()
    .input('batchId', mssql.BigInt, batchId)
    .input('status', status)
    .input('totalRecords', rawCount)
    .input('insertedRecords', newRecordsInserted)
    .input('failedRecords', status === 'SUCCESS' ? 0 : rawCount)
    .input('errorMessage', errorMessage ?? null)
    .input('finishedAt', mssql.DateTime2, new Date())
    .query(`
      UPDATE attendance_import_batches
      SET status=@status, records_total=@totalRecords, records_success=@insertedRecords,
          records_failed=@failedRecords, finished_at=@finishedAt,
          error_message=@errorMessage
      WHERE id=@batchId
    `);

  if (status !== 'SUCCESS') {
    await pool
      .request()
      .input('machineId', mssql.Int, machine.id)
      .input('accessStatus', accessStatusForFailure(failureCategory))
      .input('errorMessage', errorMessage ?? null)
      .query(`
        UPDATE attendance_machines
        SET access_status = @accessStatus,
            last_error_message = @errorMessage,
            updated_at = SYSUTCDATETIME()
        WHERE id = @machineId
      `);
  }

  const durationSec = Math.round((Date.now() - started) / 1000);
  console.log(
    `${machine.machine_code}: ${status} raw=${rawCount} inserted=${newRecordsInserted}${errorMessage ? ` error=${errorMessage}` : ''} (${durationSec}s)`
  );
  return {
    machine: machine.machine_code,
    status,
    rawCount,
    newRecordsInserted,
    errorMessage,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  const only = arg('machine');
  const requestedBatchCode = arg('batch');
  const pool = await connectDb();

  const machineQuery = await pool.request().input('machineCode', only ?? null).query<MachineRow>(`
    SELECT id, machine_code, ip_address, port, scanner_code, loc_code, access_status, data_source
    FROM attendance_machines
    WHERE is_active = 1 AND (@machineCode IS NULL OR machine_code = @machineCode)
    ORDER BY machine_code
  `);

  const machines = machineQuery.recordset;
  console.log(`Found ${machines.length} machine(s) to sync`);

  const results: SyncMachineResult[] = [];
  for (const machine of machines) {
    const result = await syncMachine(pool, machine, requestedBatchCode);
    if (result) results.push(result);
  }

  await pool.close();

  const success = results.filter((r) => r.status === 'SUCCESS');
  const failed = results.filter((r) => r.status !== 'SUCCESS');
  const totalRaw = results.reduce((sum, r) => sum + r.rawCount, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.newRecordsInserted, 0);

  console.log(`\n=== Sync Summary ===`);
  console.log(`Total: ${results.length} | Success: ${success.length} | Failed: ${failed.length}`);
  console.log(`Total raw records pulled: ${totalRaw}`);
  console.log(`Total new records inserted: ${totalInserted}`);

  if (failed.length > 0) {
    console.log(`\nFailed machines:`);
    for (const f of failed) {
      console.log(`  ${f.machine}: ${f.errorMessage}`);
    }
  }
}

main().catch((err: Error) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
