/**
 * Data Quality API Routes
 * Database: rebinmas_absensi_monitoring
 *
 * Endpoints for data quality checks and reporting
 * Uses sendJson from ../response.ts to avoid double-wrapping
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';
import { MachineTimeProfileService } from '../../modules/machines/machine-time-profile.service';
import { TimeCorrectionService } from '../../modules/attendance/time-correction.service';
import { AttendanceRebuildService } from '../../modules/attendance/attendance-rebuild.service';

const profileService = new MachineTimeProfileService();
const correctionService = new TimeCorrectionService();
const rebuildService = new AttendanceRebuildService();

// ─── Dashboard Summary ───────────────────────────────────────────────────────
route('GET', '/api/quality/dashboard-summary', async (ctx) => {
  const days = parseInt(ctx.query.get('days') ?? '7');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const [summary, recentTrend, topIssues] = await Promise.all([
    query<any>(`
      SELECT
        (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since) AS total_scan_logs,
        (SELECT COUNT(*) FROM attendance_imports  WHERE attendance_date >= @since) AS total_imports,
        (SELECT COUNT(DISTINCT raw_device_user_id) FROM attendance_scan_logs
         WHERE scan_date >= @since AND mapping_status != 'MAPPED') AS unmapped_count,
        (SELECT COUNT(*) FROM attendance_scan_logs
         WHERE scan_date >= @since AND mapping_status = 'MAPPED') AS mapped_count,
        (SELECT COUNT(*) FROM attendance_import_batches
         WHERE started_at >= @since AND status = 'FAILED') AS failed_batches
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 30
        scan_date AS date,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT parsed_employee_code)        AS unique_employees,
        SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END) AS unmapped_count
      FROM attendance_scan_logs
      WHERE scan_date >= @since
      GROUP BY scan_date
      ORDER BY scan_date DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 10
        raw_device_user_id,
        COUNT(*)                          AS occurrence_count,
        STRING_AGG(machine_code, ', ')    AS machines,
        MAX(scan_time)                    AS last_seen,
        mapping_status,
        mapping_reason
      FROM attendance_scan_logs
      WHERE scan_date >= @since AND mapping_status != 'MAPPED'
      GROUP BY raw_device_user_id, mapping_status, mapping_reason
      ORDER BY occurrence_count DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),
  ]);

  const s = summary[0] || {};
  const total = (s.total_scan_logs ?? 0) + (s.total_imports ?? 0);
  const mappedRate = total > 0
    ? Math.round(((s.mapped_count ?? 0) / total) * 100)
    : 0;

  sendJson(ctx.res, 200, {
    period_days: days,
    since,
    summary: {
      total_scan_logs: s.total_scan_logs ?? 0,
      total_imports: s.total_imports ?? 0,
      unmapped_count: s.unmapped_count ?? 0,
      mapped_count: s.mapped_count ?? 0,
      mapped_rate: mappedRate,
      failed_batches: s.failed_batches ?? 0,
    },
    daily_trend: recentTrend,
    top_issues: topIssues,
  });
});

// ─── Daily Trend ─────────────────────────────────────────────────────────────
route('GET', '/api/quality/daily-trend', async (ctx) => {
  const days = parseInt(ctx.query.get('days') ?? '30');
  const division = ctx.query.get('division') ?? '';
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  let where = 'WHERE scan_date >= @since';
  const params: any[] = [{ name: 'since', type: sql.NVarChar, value: since }];

  if (division) {
    where += ' AND parsed_division_code = @division';
    params.push({ name: 'division', type: sql.NVarChar, value: division });
  }

  const [trend, divisionBreakdown] = await Promise.all([
    query<any>(`
      SELECT
        scan_date AS date,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT parsed_employee_code)       AS unique_employees,
        SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END)    AS mapped_count,
        SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END)   AS unmapped_count
      FROM attendance_scan_logs
      ${where}
      GROUP BY scan_date
      ORDER BY scan_date DESC
    `, params),

    query<any>(`
      SELECT TOP 15
        parsed_division_code AS division,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT parsed_employee_code)       AS unique_employees,
        SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END) AS unmapped_count
      FROM attendance_scan_logs
      ${where}
      GROUP BY parsed_division_code
      ORDER BY record_count DESC
    `, params),
  ]);

  sendJson(ctx.res, 200, {
    period_days: days,
    since,
    division_filter: division || null,
    daily_trend: trend,
    by_division: divisionBreakdown,
  });
});

// ─── Unmapped Device Users ────────────────────────────────────────────────────
route('GET', '/api/quality/unmapped', async (ctx) => {
  const days = parseInt(ctx.query.get('days') ?? '30');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const machine = ctx.query.get('machine') ?? '';

  let where = 'WHERE scan_date >= @since AND mapping_status != \'MAPPED\'';
  const params: any[] = [{ name: 'since', type: sql.NVarChar, value: since }];

  if (machine) {
    where += ' AND machine_code = @machine';
    params.push({ name: 'machine', type: sql.NVarChar, value: machine });
  }

  const [unmapped, stats] = await Promise.all([
    query<any>(`
      SELECT TOP 100
        raw_device_user_id,
        COUNT(*)                                    AS occurrence_count,
        STRING_AGG(machine_code, ', ')             AS machines,
        MAX(scan_time)                              AS last_seen,
        MIN(scan_time)                              AS first_seen,
        mapping_status,
        mapping_reason
      FROM attendance_scan_logs
      ${where}
      GROUP BY raw_device_user_id, mapping_status, mapping_reason
      ORDER BY occurrence_count DESC
    `, params),

    query<any>(`
      SELECT
        COUNT(DISTINCT raw_device_user_id) AS total_unmapped,
        SUM(CASE WHEN mapping_status = 'INVALID_FORMAT' THEN 1 ELSE 0 END) AS invalid_format,
        SUM(CASE WHEN mapping_status = 'NO_EMPLOYEE_FOUND' THEN 1 ELSE 0 END) AS no_employee,
        SUM(CASE WHEN mapping_status = 'MANUAL_OVERRIDE_PENDING' THEN 1 ELSE 0 END) AS pending_override
      FROM attendance_scan_logs
      ${where}
    `, params),
  ]);

  sendJson(ctx.res, 200, {
    period_days: days,
    machine_filter: machine || null,
    total_unmapped: stats[0]?.total_unmapped ?? 0,
    breakdown: {
      invalid_format: stats[0]?.invalid_format ?? 0,
      no_employee_found: stats[0]?.no_employee ?? 0,
      pending_override: stats[0]?.pending_override ?? 0,
    },
    items: unmapped,
  });
});

// ─── Duplicate Scans ──────────────────────────────────────────────────────────
route('GET', '/api/quality/duplicates', async (ctx) => {
  const machine = ctx.query.get('machine') ?? '';
  const days = parseInt(ctx.query.get('days') ?? '30');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  let where = 'WHERE scan_date >= @since';
  const params: any[] = [{ name: 'since', type: sql.NVarChar, value: since }];

  if (machine) {
    where += ' AND machine_code = @machine';
    params.push({ name: 'machine', type: sql.NVarChar, value: machine });
  }

  const duplicates = await query<any>(`
    SELECT TOP 100
      raw_device_user_id,
      machine_code,
      scan_date,
      COUNT(*) AS scan_count,
      MIN(scan_time) AS first_scan,
      MAX(scan_time) AS last_scan,
      STRING_AGG(CONVERT(varchar, scan_time, 108), ', ') AS all_times
    FROM attendance_scan_logs
    ${where}
    GROUP BY raw_device_user_id, machine_code, scan_date
    HAVING COUNT(*) > 1
    ORDER BY scan_count DESC, scan_date DESC
  `, params);

  const totalExtra = duplicates.reduce((sum: number, d: any) => sum + (d.scan_count - 1), 0);

  sendJson(ctx.res, 200, {
    period_days: days,
    machine_filter: machine || null,
    duplicate_groups: duplicates.length,
    extra_records: totalExtra,
    items: duplicates,
  });
});

// ─── Machine Time Drift ────────────────────────────────────────────────────────
route('GET', '/api/quality/machine-drift', async (ctx) => {
  const threshold = parseInt(ctx.query.get('threshold') ?? '300'); // seconds

  const machines = await query<any>(`
    SELECT
      m.machine_code,
      m.location_name,
      m.ip_address,
      m.last_sync_at,
      m.access_status,
      sl.started_at AS last_sync_started,
      sl.duration_ms
    FROM attendance_machines m
    LEFT JOIN attendance_sync_logs sl ON sl.machine_code = m.machine_code
      AND sl.started_at = (
        SELECT MAX(started_at) FROM attendance_sync_logs
        WHERE machine_code = m.machine_code
      )
    WHERE m.is_active = 1
    ORDER BY m.machine_code
  `);

  const driftStatus = machines.map((m: any) => {
    const lastSync = m.last_sync_at ? new Date(m.last_sync_at) : null;
    const now = new Date();
    const driftSeconds = lastSync
      ? Math.floor((now.getTime() - lastSync.getTime()) / 1000)
      : null;

    return {
      machine_code: m.machine_code,
      location_name: m.location_name,
      ip_address: m.ip_address,
      access_status: m.access_status,
      last_sync_at: m.last_sync_at,
      drift_seconds: driftSeconds,
      is_within_tolerance: driftSeconds !== null && driftSeconds <= threshold,
      status: !driftSeconds ? 'NEVER_SYNCED'
        : driftSeconds <= threshold ? 'SYNCED'
        : driftSeconds <= threshold * 2 ? 'DRIFTED'
        : 'CRITICAL',
    };
  });

  const outOfSync = driftStatus.filter((d: any) => !d.is_within_tolerance);

  sendJson(ctx.res, 200, {
    threshold_seconds: threshold,
    total_machines: driftStatus.length,
    synced_machines: driftStatus.length - outOfSync.length,
    drifted_machines: outOfSync.length,
    items: driftStatus,
  });
});

// ─── Quality Report (comprehensive) ───────────────────────────────────────────
route('GET', '/api/quality/report', async (ctx) => {
  const days = parseInt(ctx.query.get('days') ?? '30');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const [summary, dailyTrend, divisionStats, unmappedCodes, batchStats] = await Promise.all([
    query<any>(`
      SELECT
        (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since) AS total_scan_logs,
        (SELECT COUNT(*) FROM attendance_imports  WHERE attendance_date >= @since) AS total_imports,
        (SELECT COUNT(DISTINCT raw_device_user_id) FROM attendance_scan_logs
         WHERE scan_date >= @since AND mapping_status != 'MAPPED') AS unmapped_count,
        (SELECT COUNT(*) FROM attendance_scan_logs
         WHERE scan_date >= @since AND mapping_status = 'MAPPED') AS mapped_count
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT
        scan_date AS date,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT parsed_employee_code)       AS unique_employees
      FROM attendance_scan_logs
      WHERE scan_date >= @since
      GROUP BY scan_date
      ORDER BY scan_date DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 20
        parsed_division_code AS division,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT parsed_employee_code)       AS unique_employees,
        SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END) AS unmapped_count
      FROM attendance_scan_logs
      WHERE scan_date >= @since
      GROUP BY parsed_division_code
      ORDER BY record_count DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 30
        raw_device_user_id,
        COUNT(*)                          AS occurrence_count,
        STRING_AGG(machine_code, ', ')   AS machines,
        MAX(scan_time)                    AS last_seen
      FROM attendance_scan_logs
      WHERE scan_date >= @since AND mapping_status != 'MAPPED'
      GROUP BY raw_device_user_id
      ORDER BY occurrence_count DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT
        status,
        COUNT(*)         AS batch_count,
        SUM(records_total)    AS total_records,
        SUM(records_success)  AS success_records,
        SUM(records_failed)   AS failed_records
      FROM attendance_import_batches
      WHERE started_at >= @since
      GROUP BY status
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),
  ]);

  const s = summary[0] || {};
  const total = (s.total_scan_logs ?? 0) + (s.total_imports ?? 0);
  const mappedRate = total > 0
    ? Math.round(((s.mapped_count ?? 0) / total) * 100)
    : 0;

  sendJson(ctx.res, 200, {
    period_days: days,
    since,
    summary: {
      total_scan_logs: s.total_scan_logs ?? 0,
      total_imports: s.total_imports ?? 0,
      unmapped_count: s.unmapped_count ?? 0,
      mapped_count: s.mapped_count ?? 0,
      mapped_rate: mappedRate,
    },
    daily_trend: dailyTrend,
    by_division: divisionStats,
    unmapped_codes: unmappedCodes,
    batch_summary: batchStats,
  });
});

// ─── Quick Summary (for dashboard) ─────────────────────────────────────────────
route('GET', '/api/quality/summary', async (ctx) => {
  const days = parseInt(ctx.query.get('days') ?? '7');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const stats = await query<any>(`
    SELECT
      (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since) AS total_scans,
      (SELECT COUNT(DISTINCT parsed_employee_code) FROM attendance_scan_logs
       WHERE scan_date >= @since AND mapping_status = 'MAPPED') AS mapped_employees,
      (SELECT COUNT(DISTINCT raw_device_user_id) FROM attendance_scan_logs
       WHERE scan_date >= @since AND mapping_status != 'MAPPED') AS unmapped_codes,
      (SELECT COUNT(*) FROM attendance_import_batches
       WHERE started_at >= @since AND status = 'FAILED') AS failed_batches,
      (SELECT COUNT(*) FROM attendance_import_batches
       WHERE started_at >= @since AND status = 'COMPLETED') AS completed_batches
  `, [{ name: 'since', type: sql.NVarChar, value: since }]);

  const s = stats[0] || {};
  const total = (s.mapped_employees ?? 0) + (s.unmapped_codes ?? 0);
  const score = total > 0 ? Math.round(((s.mapped_employees ?? 0) / total) * 100) : 0;
  const status = (s.failed_batches ?? 0) > 0 ? 'WARNING' : 'HEALTHY';

  // Build metrics array for QualityReport format
  const mapped = s.mapped_employees ?? 0;
  const unmapped = s.unmapped_codes ?? 0;
  const failedBatches = s.failed_batches ?? 0;

  sendJson(ctx.res, 200, {
    period_days: days,
    total_scans: s.total_scans ?? 0,
    mapped_employees: mapped,
    unmapped_codes: unmapped,
    failed_batches: failedBatches,
    completed_batches: s.completed_batches ?? 0,
    status: status,
    // QualityReport compatible format
    overall_status: score >= 90 ? 'healthy' : score >= 70 ? 'warning' : 'critical',
    score: score,
    metrics: [
      {
        name: 'Karyawan Terpetakan',
        status: mapped > 0 ? 'healthy' : 'warning',
        value: mapped,
        description: 'Jumlah karyawan yang berhasil dipetakan ke kode perangkat'
      },
      {
        name: 'Kode Tidak Terpetakan',
        status: unmapped > 0 ? 'warning' : 'healthy',
        value: unmapped,
        description: 'Kode perangkat yang belum dipetakan ke karyawan manapun'
      },
      {
        name: 'Batch Gagal',
        status: failedBatches > 0 ? 'critical' : 'healthy',
        value: failedBatches,
        description: 'Jumlah batch impor yang gagal diproses'
      }
    ],
    summary: {
      healthy_count: mapped,
      warning_count: failedBatches,
      critical_count: unmapped
    }
  });
});

// ─── CurrentEmpCode Quality Summary ──────────────────────────────────────────
route('GET', '/api/quality/current-empcode/summary', async (ctx) => {
  const [registryStats, parsedCodeChanges, snapshotHealth] = await Promise.all([
    // Registry quality summary by resolution status
    query<any>(`
      SELECT
        current_resolution_status AS status,
        COUNT(*) AS total
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status IS NOT NULL
      GROUP BY current_resolution_status
    `),

    // ParsedCode → currentEmpCode changes
    query<any>(`
      SELECT TOP 20
        parsed_employee_code AS parsed_code,
        current_emp_code,
        COUNT(*) AS change_count
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_emp_code IS NOT NULL
        AND parsed_employee_code <> current_emp_code
      GROUP BY parsed_employee_code, current_emp_code
      ORDER BY change_count DESC
    `),

    // Snapshot health stats
    query<any>(`
      SELECT
        COUNT(*) AS total_snapshots,
        SUM(CASE WHEN is_ambiguous = 1 THEN 1 ELSE 0 END) AS ambiguous_nik,
        MAX(synced_at) AS last_sync_at
      FROM dbo.hr_employee_current_snapshot
    `),
  ]);

  // Build registry quality breakdown
  const registryMap: Record<string, number> = {};
  let totalRegistry = 0;
  for (const row of registryStats) {
    const status = row.status ?? 'UNKNOWN';
    registryMap[status] = Number(row.total ?? 0);
    totalRegistry += Number(row.total ?? 0);
  }

  const registryQuality = {
    totalRegistry,
    mappedCurrent: registryMap['MAPPED_CURRENT'] ?? 0,
    parsedOnly: registryMap['PARSED_ONLY'] ?? 0,
    parsedCodeNotFound: registryMap['PARSED_CODE_NOT_FOUND_IN_HR'] ?? 0,
    nikNotFound: registryMap['NIK_NOT_FOUND'] ?? 0,
    currentEmpNotFound: registryMap['CURRENT_EMP_NOT_FOUND'] ?? 0,
    ambiguousNik: registryMap['NIK_DUPLICATE_AMBIGUOUS'] ?? 0,
    needReview: registryMap['NEED_REVIEW_CURRENT'] ?? 0,
  };

  const parsedCodeChangesResult = {
    total: parsedCodeChanges.reduce((sum: number, r: any) => sum + Number(r.change_count), 0),
    changes: parsedCodeChanges.map((r: any) => ({
      parsedCode: r.parsed_code,
      currentEmpCode: r.current_emp_code,
      count: Number(r.change_count),
    })),
  };

  const snap = snapshotHealth[0] ?? {};
  const snapshotHealthResult = {
    totalSnapshots: Number(snap.total_snapshots ?? 0),
    ambiguousNik: Number(snap.ambiguous_nik ?? 0),
    lastSyncAt: snap.last_sync_at ?? null,
  };

  sendJson(ctx.res, 200, {
    registryQuality,
    parsedCodeChanges: parsedCodeChangesResult,
    snapshotHealth: snapshotHealthResult,
  });
});

// ─── CurrentEmpCode Ambiguous List ─────────────────────────────────────────────
route('GET', '/api/quality/current-empcode/ambiguous', async (ctx) => {
  const ambiguousRecords = await query<any>(`
    SELECT
      nik,
      current_emp_code,
      active_count,
      ambiguity_reason
    FROM dbo.hr_employee_current_snapshot
    WHERE is_ambiguous = 1
    ORDER BY active_count DESC, nik ASC
  `);

  const data = ambiguousRecords.map((r: any) => ({
    nik: r.nik,
    currentEmpCode: r.current_emp_code,
    activeCount: Number(r.active_count ?? 0),
    ambiguityReason: r.ambiguity_reason ?? 'Multiple active rows with same UpdateDate',
  }));

  sendJson(ctx.res, 200, {
    data,
    total: data.length,
  });
});

// ─── CurrentEmpCode Changes List ───────────────────────────────────────────────
route('GET', '/api/quality/current-empcode/changes', async (ctx) => {
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '100'), 500);
  const offset = parseInt(ctx.query.get('offset') ?? '0');

  const [changes, countResult] = await Promise.all([
    query<any>(`
      SELECT TOP (@limit)
        raw_device_user_id,
        parsed_employee_code AS parsed_code,
        current_emp_code,
        resolved_nik,
        current_emp_name,
        current_hr_status,
        current_resolution_status,
        current_resolution_reason
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_emp_code IS NOT NULL
        AND parsed_employee_code <> current_emp_code
      ORDER BY current_resolved_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, [
      { name: 'limit', type: sql.Int, value: limit },
      { name: 'offset', type: sql.Int, value: offset },
    ]),

    query<any>(`
      SELECT COUNT(*) AS total
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_emp_code IS NOT NULL
        AND parsed_employee_code <> current_emp_code
    `),
  ]);

  const data = changes.map((r: any) => ({
    rawDeviceUserId: r.raw_device_user_id,
    parsedCode: r.parsed_code,
    currentEmpCode: r.current_emp_code,
    resolvedNik: r.resolved_nik,
    currentEmpName: r.current_emp_name,
    currentHrStatus: r.current_hr_status,
    resolutionStatus: r.current_resolution_status,
    resolutionReason: r.current_resolution_reason,
  }));

  sendJson(ctx.res, 200, {
    data,
    total: Number(countResult[0]?.total ?? 0),
    limit,
    offset,
  });
});

// ─── Machine Clock Quality Routes ────────────────────────────────────────────

route('GET', '/api/quality/machine-clock', async (ctx) => {
  const health = await profileService.getClockHealthAll();
  sendJson(ctx.res, 200, { success: true, data: health });
});

route('GET', '/api/quality/machine-clock/:machineCode', async (ctx) => {
  const { machineCode } = ctx.params;
  const [profile, health] = await Promise.all([
    profileService.getActiveProfile(machineCode),
    profileService.getClockHealthAll().then(list => list.find((h) => h.machineCode === machineCode)),
  ]);
  sendJson(ctx.res, 200, { success: true, data: { profile, health } });
});

route('POST', '/api/quality/machine-clock/preview-correction', async (ctx) => {
  const body = ctx.body as { machineCode?: string; dateFrom?: string; dateTo?: string; offsetMinutes?: number } | undefined;
  if (!body?.machineCode || !body?.dateFrom || !body?.dateTo || body?.offsetMinutes == null) {
    sendError(ctx.res, 400, 'MISSING_PARAMS', 'machineCode, dateFrom, dateTo, offsetMinutes required'); return;
  }
  const preview = await correctionService.previewCorrection({
    machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo, offsetMinutes: body.offsetMinutes,
  });
  sendJson(ctx.res, 200, { success: true, data: preview });
});

route('POST', '/api/quality/machine-clock/apply-correction', async (ctx) => {
  const body = ctx.body as { machineCode?: string; dateFrom?: string; dateTo?: string; offsetMinutes?: number; executedBy?: string; dryRun?: boolean; rebuildImports?: boolean } | undefined;
  if (!body?.machineCode || !body?.dateFrom || !body?.dateTo || body?.offsetMinutes == null) {
    sendError(ctx.res, 400, 'MISSING_PARAMS', 'machineCode, dateFrom, dateTo, offsetMinutes required'); return;
  }
  const result = await correctionService.applyCorrection({
    machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo,
    offsetMinutes: body.offsetMinutes, executedBy: body.executedBy ?? 'API', dryRun: body.dryRun ?? false,
  });
  let rebuildResult = null;
  if (result.success && !body.dryRun && body.rebuildImports !== false) {
    rebuildResult = await rebuildService.rebuildImports({
      machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo,
    });
  }
  sendJson(ctx.res, result.success ? 200 : 500, { success: result.success, data: { ...result, rebuildResult } });
});

route('POST', '/api/quality/machine-clock/rollback', async (ctx) => {
  const body = ctx.body as { batchId?: number; executedBy?: string; rebuildImports?: boolean } | undefined;
  if (!body?.batchId) { sendError(ctx.res, 400, 'MISSING_BATCH_ID', 'batchId required'); return; }
  const rollbackResult = await correctionService.rollbackBatch(body.batchId, body.executedBy ?? 'API');
  let rebuildResult = null;
  if (rollbackResult.success && body.rebuildImports !== false) {
    const batch = await correctionService.getBatchDetail(body.batchId);
    if (batch.batch) {
      rebuildResult = await rebuildService.rebuildImports({
        machineCode: batch.batch.machine_code,
        dateFrom: String(batch.batch.date_from),
        dateTo: String(batch.batch.date_to),
      });
    }
  }
  sendJson(ctx.res, 200, { success: rollbackResult.success, data: { ...rollbackResult, rebuildResult } });
});

route('GET', '/api/quality/machine-clock/batch/:batchId', async (ctx) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!batchId) { sendError(ctx.res, 400, 'INVALID_BATCH_ID', 'batchId must be a valid integer'); return; }
  const detail = await correctionService.getBatchDetail(batchId);
  sendJson(ctx.res, 200, { success: true, data: detail });
});
