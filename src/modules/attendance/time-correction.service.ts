import { query, execute, withTransaction, sql } from '../../lib/db';

export interface CorrectionPreview {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  affectedRows: number; dateChangedRows: number; collisionCount: number;
  sample: Array<{ id: number; oldScanTime: string; newScanTime: string; oldScanDate: string; newScanDate: string; rawDeviceUserId: string }>;
}

export class TimeCorrectionService {
  async previewCorrection(params: { machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number }): Promise<CorrectionPreview> {
    const { machineCode, dateFrom, dateTo, offsetMinutes } = params;
    const [affected, dateChanged, collisions, sample] = await Promise.all([
      query<any>(`SELECT COUNT(*) AS cnt FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo }]),
      query<any>(`SELECT COUNT(*) AS cnt FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
          AND CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) <> scan_date`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
      query<any>(`WITH candidate AS (
        SELECT id, machine_code, raw_device_user_id, DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
      ) SELECT COUNT(*) AS cnt FROM candidate c
        JOIN attendance_scan_logs s ON s.machine_code = c.machine_code AND s.raw_device_user_id = c.raw_device_user_id
          AND s.scan_time = c.new_scan_time AND s.id <> c.id
        WHERE s.machine_code = @machineCode`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
      query<any>(`SELECT TOP 10 id, raw_device_user_id, scan_time AS old_scan_time,
        DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time,
        scan_date AS old_scan_date, CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) AS new_scan_date
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        ORDER BY scan_time`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
    ]);
    return {
      machineCode, dateFrom, dateTo, offsetMinutes,
      affectedRows: Number(affected[0]?.cnt ?? 0),
      dateChangedRows: Number(dateChanged[0]?.cnt ?? 0),
      collisionCount: Number(collisions[0]?.cnt ?? 0),
      sample: sample.map((s: any) => ({
        id: Number(s.id),
        oldScanTime: new Date(s.old_scan_time).toISOString(),
        newScanTime: new Date(s.new_scan_time).toISOString(),
        oldScanDate: String(s.old_scan_date),
        newScanDate: String(s.new_scan_date),
        rawDeviceUserId: s.raw_device_user_id,
      })),
    };
  }

  async applyCorrection(params: { machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number; executedBy: string; dryRun?: boolean }): Promise<{ success: boolean; batchId: number; batchCode: string; appliedCount: number }> {
    const { machineCode, dateFrom, dateTo, offsetMinutes, executedBy, dryRun } = params;
    if (dryRun) {
      const preview = await this.previewCorrection({ machineCode, dateFrom, dateTo, offsetMinutes });
      return { success: true, batchId: 0, batchCode: 'DRY-RUN', appliedCount: preview.affectedRows };
    }
    return withTransaction(async (tx: any) => {
      const batchCode = 'TIMEFIX-' + machineCode + '-' + new Date().toISOString().replace(/[:.]/g, '-');
      const batchResult = await tx.request()
        .input('batchCode', sql.NVarChar, batchCode)
        .input('scope', sql.NVarChar, 'MACHINE_DATE_RANGE')
        .input('machineCode', sql.NVarChar, machineCode)
        .input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo)
        .input('offsetMinutes', sql.Int, offsetMinutes)
        .input('status', sql.NVarChar, 'RUNNING')
        .input('startedAt', sql.DateTime2, new Date())
        .input('executedBy', sql.NVarChar, executedBy)
        .input('notes', sql.NVarChar, 'UTC timestamp normalized to WIB')
        .query(`INSERT INTO attendance_time_correction_batch
          (batch_code, correction_scope, machine_code, date_from, date_to, offset_minutes, status, started_at, executed_by, notes)
          OUTPUT INSERTED.batch_id
          VALUES (@batchCode, @scope, @machineCode, @dateFrom, @dateTo, @offsetMinutes, @status, @startedAt, @executedBy, @notes)`);
      const batchId = Number(batchResult.recordset[0].batch_id);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode).input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo).input('offsetMinutes', sql.Int, offsetMinutes)
        .query(`INSERT INTO attendance_time_correction_detail
          (batch_id, scan_log_id, machine_code, raw_device_user_id, parsed_employee_code,
           old_scan_time, new_scan_time, old_scan_date, new_scan_date, offset_minutes, correction_status, correction_reason)
          SELECT @batchId, id, machine_code, raw_device_user_id, parsed_employee_code, scan_time,
                 DATEADD(MINUTE, @offsetMinutes, scan_time), scan_date,
                 CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE),
                 @offsetMinutes, 'CORRECTED', 'Historical UTC timestamp normalized to WIB'
          FROM attendance_scan_logs
          WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode).input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo).input('offsetMinutes', sql.Int, offsetMinutes)
        .input('executedBy', sql.NVarChar, executedBy)
        .query(`UPDATE sl SET
          scan_time_original = ISNULL(sl.scan_time_original, sl.scan_time),
          scan_date_original = ISNULL(sl.scan_date_original, sl.scan_date),
          scan_time_wib = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
          scan_date_wib = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
          scan_time = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
          scan_date = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
          time_correction_status = 'CORRECTED',
          time_correction_offset_minutes = @offsetMinutes,
          time_correction_reason = 'Historical UTC timestamp normalized to WIB',
          time_corrected_at = SYSDATETIME(), time_corrected_by = @executedBy,
          time_correction_batch_id = @batchId
          FROM attendance_scan_logs sl
          WHERE sl.machine_code = @machineCode AND sl.scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(sl.time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .query(`UPDATE attendance_time_correction_batch SET status = 'COMPLETED', completed_at = SYSDATETIME(),
          applied_count = (SELECT COUNT(*) FROM attendance_time_correction_detail WHERE batch_id = @batchId)
          WHERE batch_id = @batchId`);

      return { success: true, batchId, batchCode, appliedCount: 0 };
    });
  }

  async rollbackBatch(batchId: number, executedBy: string): Promise<{ success: boolean; rolledBackCount: number }> {
    return withTransaction(async (tx: any) => {
      const result = await tx.request().input('batchId', sql.BigInt, batchId)
        .input('executedBy', sql.NVarChar, executedBy)
        .query(`UPDATE sl SET
          scan_time = ISNULL(d.old_scan_time, sl.scan_time),
          scan_date = ISNULL(d.old_scan_date, sl.scan_date),
          scan_time_wib = NULL, scan_date_wib = NULL,
          time_correction_status = 'ROLLBACKED',
          time_correction_reason = CONCAT('Rollback from batch ', @batchId),
          time_corrected_at = SYSDATETIME(), time_corrected_by = @executedBy,
          time_correction_batch_id = NULL
          FROM attendance_scan_logs sl
          JOIN attendance_time_correction_detail d ON d.scan_log_id = sl.id
          WHERE d.batch_id = @batchId`);
      await tx.request().input('batchId', sql.BigInt, batchId)
        .query(`UPDATE attendance_time_correction_batch SET status = 'ROLLBACKED', completed_at = SYSDATETIME() WHERE batch_id = @batchId`);
      return { success: true, rolledBackCount: result.rowsAffected?.[0] ?? 0 };
    });
  }

  async getBatchDetail(batchId: number) {
    const [batch, details] = await Promise.all([
      query<any>(`SELECT batch_id, batch_code, correction_scope, machine_code, date_from, date_to,
        offset_minutes, status, applied_count, skipped_count, error_count,
        started_at, completed_at, executed_by, notes, created_at
        FROM attendance_time_correction_batch WHERE batch_id = @batchId`,
        [{ name: 'batchId', type: sql.BigInt, value: batchId }]),
      query<any>(`SELECT TOP 50 detail_id, scan_log_id, machine_code, raw_device_user_id, parsed_employee_code,
        old_scan_time, new_scan_time, old_scan_date, new_scan_date, correction_status, correction_reason, created_at
        FROM attendance_time_correction_detail WHERE batch_id = @batchId ORDER BY old_scan_time`,
        [{ name: 'batchId', type: sql.BigInt, value: batchId }]),
    ]);
    return { batch: batch[0], details };
  }
}

export const timeCorrectionService = new TimeCorrectionService();
