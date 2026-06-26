import { query, execute, sql } from '../../lib/db';

export class AttendanceRebuildService {
  async rebuildImports(params: { machineCode: string; dateFrom: string; dateTo: string; source?: string }): Promise<{ deleted: number; inserted: number }> {
    const { machineCode, dateFrom, dateTo, source = 'ZKTECO' } = params;
    const before = await query<any>(`SELECT COUNT(*) AS cnt FROM attendance_imports
      WHERE machine_code = @machineCode AND attendance_date BETWEEN @dateFrom AND @dateTo AND source = @source`,
      [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
       { name: 'dateFrom', type: sql.Date, value: dateFrom },
       { name: 'dateTo', type: sql.Date, value: dateTo },
       { name: 'source', type: sql.NVarChar, value: source }]);
    const deleted = Number(before[0]?.cnt ?? 0);
    await execute(`DELETE FROM attendance_imports
      WHERE machine_code = @machineCode AND attendance_date BETWEEN @dateFrom AND @dateTo AND source = @source`,
      [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
       { name: 'dateFrom', type: sql.Date, value: dateFrom },
       { name: 'dateTo', type: sql.Date, value: dateTo },
       { name: 'source', type: sql.NVarChar, value: source }]);

    const BATCH = 500;
    let totalInserted = 0, offset = 0, hasMore = true;
    while (hasMore) {
      const result = await execute(`
        INSERT INTO attendance_imports (employee_id, employee_code, division_code, attendance_date, attendance_year, attendance_month,
          check_in_at, check_out_at, total_scans, attendance_status, has_work, source, source_reference, batch_id, needs_manual_review)
        OUTPUT INSERTED.id
        SELECT TOP ${BATCH}
          COALESCE(e.id, NULL), COALESCE(s.current_emp_code, s.parsed_employee_code),
          COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'),
          s.scan_date, YEAR(s.scan_date), MONTH(s.scan_date),
          MIN(s.scan_time), CASE WHEN COUNT(*) >= 2 THEN MAX(s.scan_time) ELSE NULL END,
          COUNT(*), CASE WHEN COUNT(*) >= 2 THEN 'HADIR' WHEN COUNT(*) = 1 THEN 'INCOMPLETE_SCAN' ELSE 'NO_DATA' END,
          CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END, 'ZKTECO', s.machine_code, ISNULL(MAX(s.sync_batch_id), 0),
          CASE WHEN e.id IS NOT NULL THEN 0 ELSE 1 END
        FROM attendance_scan_logs s
        LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
        LEFT JOIN divisions d ON d.id = e.division_id
        WHERE s.machine_code = @machineCode AND s.scan_date BETWEEN @dateFrom AND @dateTo AND s.mapping_status = 'MAPPED'
        GROUP BY COALESCE(e.id, NULL), COALESCE(s.current_emp_code, s.parsed_employee_code),
                 COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'), s.scan_date, s.machine_code
        OFFSET ${offset} ROWS
      `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
          { name: 'dateFrom', type: sql.Date, value: dateFrom },
          { name: 'dateTo', type: sql.Date, value: dateTo }]);
      const n = Number(result.rowsAffected?.[0] ?? 0);
      totalInserted += n; offset += BATCH; hasMore = n === BATCH;
    }
    return { deleted, inserted: totalInserted };
  }
}

export const attendanceRebuildService = new AttendanceRebuildService();
