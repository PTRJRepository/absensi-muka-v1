/**
 * Machine Employee Routes
 * GET /api/monitoring/machine/:code/employees  - employee data machine vs DB
 * GET /api/monitoring/machine/:code/raw-data   - raw scan logs (paginated)
 * GET /api/monitoring/machine-ping             - ping all machines
 * POST /api/monitoring/employees/:code/map    - manual map raw_id -> employee_code
 *
 * Architecture: attendance_scan_logs is the RAW layer. Employee resolution uses
 * the employees table (which has zkteco_user_id, parsed_employee_code, current_emp_code).
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';
import { requireAnyRole } from '../middleware/auth';
import { writeAudit } from '../services/audit.service';

function rawIdLengthSql(alias = 's') {
  return `LEN(LTRIM(RTRIM(CAST(${alias}.raw_device_user_id AS NVARCHAR(100)))))`;
}

/**
 * Employee code: priority cascade from attendance_scan_logs.
 * 1. parsed_employee_code from scan log (via SSOT parser)
 * 2. employees.current_emp_code via zkteco_user_id lookup
 * 3. employees.current_emp_code via parsed_employee_code → employee_code lookup
 */
function resolvedEmployeeCodeSql(alias = 's') {
  return `COALESCE(
    NULLIF(LTRIM(RTRIM(${alias}.parsed_employee_code)), ''),
    (
      SELECT TOP 1 e.current_emp_code
      FROM employees e
      WHERE LTRIM(RTRIM(e.zkteco_user_id)) = LTRIM(RTRIM(${alias}.raw_device_user_id))
        AND e.current_emp_code IS NOT NULL
      ORDER BY e.id DESC
    ),
    (
      SELECT TOP 1 e.current_emp_code
      FROM employees e
      WHERE LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(${alias}.parsed_employee_code))
        AND e.current_emp_code IS NOT NULL
      ORDER BY e.id DESC
    )
  )`;
}

/**
 * Employee name: priority cascade.
 * 1. employees.employee_name via zkteco_user_id or employee_code lookup
 * 2. attendance_scan_logs.zkteco_user_name (from machine)
 */
function resolvedEmployeeNameSql(alias = 's') {
  return `COALESCE(
    (
      SELECT TOP 1 e.employee_name
      FROM employees e
      WHERE LTRIM(RTRIM(e.zkteco_user_id)) = LTRIM(RTRIM(${alias}.raw_device_user_id))
        AND e.employee_name IS NOT NULL
      ORDER BY e.id DESC
    ),
    (
      SELECT TOP 1 e.employee_name
      FROM employees e
      WHERE LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(${alias}.parsed_employee_code))
        AND e.employee_name IS NOT NULL
      ORDER BY e.id DESC
    ),
    NULLIF(LTRIM(RTRIM(${alias}.zkteco_user_name)), '')
  )`;
}

function resolvedMappingReasonSql(alias = 's') {
  const rawLength = rawIdLengthSql(alias);
  const empCode = resolvedEmployeeCodeSql(alias);
  const empName = resolvedEmployeeNameSql(alias);

  return `CASE
    WHEN ${rawLength} <= 5 THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
    WHEN ${empCode} IS NOT NULL AND ${empName} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE'
    WHEN ${empCode} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE_PENDING_NAME'
    WHEN ${rawLength} > 5 THEN 'CURRENT_EMP_CODE_NOT_FOUND_NEED_REVIEW'
    ELSE 'UNKNOWN'
  END`;
}

// ─── Machine Ping (all or one) ─────────────────────────────────────────────────
route('POST', '/api/monitoring/machine-ping', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'machine ping')) return;
  const code = ctx.query.get('machine') ?? '';
  const whereClause = code ? 'WHERE machine_code = @code AND is_active = 1' : 'WHERE is_active = 1';

  const machines = await query<any>(`
    SELECT machine_code, ip_address, port
    FROM attendance_machines
    ${whereClause}
    ${code ? '' : 'AND data_source = \'DIRECT_ZKTECO\''}
  `, code ? [{ name: 'code', type: sql.NVarChar, value: code }] : []);

  const results = await Promise.all(
    machines.map(async (m: any) => {
      const start = Date.now();
      const { stdout } = await runPowerShell(`
        try {
          $tcp = New-Object System.Net.Sockets.TcpClient;
          $conn = $tcp.BeginConnect('${m.ip_address}', ${m.port}, $null, $null);
          $ok = $conn.AsyncWaitHandle.WaitOne(3000);
          $lat = $tcp.Connected ? ${Date.now()} - ${start} : $null;
          if ($ok -and $tcp.Connected) { Write-Output "OK:$lat" } else { Write-Output "TIMEOUT" }
          $tcp.Close();
        } catch { Write-Output "ERROR" }
      `);
      const out = stdout.trim();
      const [status, lat] = out.split(':');
      return {
        machine_code: m.machine_code,
        ip: m.ip_address,
        port: m.port,
        reachable: status === 'OK',
        latency_ms: status === 'OK' ? parseInt(lat) : null,
        status: status === 'OK' ? 'ONLINE' : status === 'TIMEOUT' ? 'TIMEOUT' : 'UNREACHABLE',
      };
    })
  );

  sendJson(ctx.res, 200, results);
});

// ─── Machine Employees (raw vs DB comparison) ──────────────────────────────────
route('GET', '/api/monitoring/machine/:code/employees', async (ctx) => {
  const { code } = ctx.params;

  const machines = await query<any>(`
    SELECT id, machine_code, location_name, ip_address, port, access_status
    FROM attendance_machines WHERE machine_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);
  if (!machines.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Machine not found');

  const [rawStats, mappedStats, unmappedStats, dbEmployees] = await Promise.all([
    // All unique raw IDs from this machine (datamesin mode)
    query<any>(`
      WITH scan_source AS (
        SELECT
          s.raw_device_user_id,
          s.parsed_employee_code,
          NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
          s.mapping_status,
          s.mapping_reason,
          ${rawIdLengthSql()} AS raw_id_length,
          ${resolvedEmployeeCodeSql()} AS employee_code,
          ${resolvedMappingReasonSql()} AS mapping_reason_computed,
          s.scan_time
        FROM attendance_scan_logs s
        WHERE s.machine_code = @code
      )
      SELECT TOP 100
        raw_device_user_id AS raw_id,
        MAX(parsed_employee_code) AS parsed_employee_code,
        MAX(employee_code) AS employee_code,
        MAX(zkteco_user_name) AS zkteco_user_name,
        CASE WHEN MAX(employee_code) IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
        MAX(mapping_reason_computed) AS mapping_reason,
        MAX(raw_id_length) AS raw_id_length,
        COUNT(*) AS occurrence_count,
        MAX(scan_time) AS last_seen
      FROM scan_source
      GROUP BY raw_device_user_id
      ORDER BY occurrence_count DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),

    // Mapped records (have employee code)
    query<any>(`
      SELECT TOP 100
        s.raw_device_user_id AS raw_id,
        s.parsed_employee_code,
        ${resolvedEmployeeCodeSql()} AS employee_code,
        ${resolvedEmployeeNameSql()} AS employee_name,
        COUNT(*) AS occurrence_count,
        MAX(s.scan_time) AS last_seen
      FROM attendance_scan_logs s
      WHERE s.machine_code = @code
        AND ${resolvedEmployeeCodeSql()} IS NOT NULL
      GROUP BY s.raw_device_user_id, s.parsed_employee_code
      ORDER BY occurrence_count DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),

    // Unmapped records (no employee code found)
    query<any>(`
      WITH scan_source AS (
        SELECT
          s.raw_device_user_id,
          NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
          s.mapping_status,
          s.mapping_reason,
          ${rawIdLengthSql()} AS raw_id_length,
          ${resolvedEmployeeCodeSql()} AS employee_code,
          ${resolvedMappingReasonSql()} AS mapping_reason_computed,
          s.scan_time
        FROM attendance_scan_logs s
        WHERE s.machine_code = @code
          AND ${resolvedEmployeeCodeSql()} IS NULL
      )
      SELECT TOP 100
        raw_device_user_id AS raw_id,
        COUNT(*) AS occurrence_count,
        MAX(scan_time) AS last_seen,
        MAX(zkteco_user_name) AS zkteco_user_name,
        CASE WHEN MAX(raw_id_length) <= 5 THEN 'EXCLUDED_SHORT_ID' ELSE 'NEED_REVIEW' END AS mapping_status,
        MAX(mapping_reason_computed) AS mapping_reason,
        MAX(raw_id_length) AS raw_id_length
      FROM scan_source
      GROUP BY raw_device_user_id
      ORDER BY occurrence_count DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),

    // DB employees who have records in this machine
    query<any>(`
      SELECT DISTINCT TOP 50
        e.employee_code,
        e.employee_name,
        d.division_code,
        s.machine_code,
        MAX(s.scan_time) AS last_scan
      FROM employees e
      INNER JOIN attendance_scan_logs s ON s.parsed_employee_code = e.employee_code
        AND s.machine_code = @code
      INNER JOIN attendance_machines m ON m.machine_code = s.machine_code
      LEFT JOIN divisions d ON d.id = e.division_id
      GROUP BY e.employee_code, e.employee_name, d.division_code, s.machine_code
      ORDER BY last_scan DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
  ]);

  sendJson(ctx.res, 200, {
    machine: machines[0],
    summary: {
      total_unique_ids: rawStats.length,
      mapped_count: mappedStats.length,
      unmapped_count: unmappedStats.length,
      db_employees_seen: dbEmployees.length,
    },
    machine_raw: rawStats,
    database_mapped: mappedStats,
    unmapped: unmappedStats,
    db_employees: dbEmployees,
  });
});

// ─── Machine Raw Data (paginated) ──────────────────────────────────────────────
route('GET', '/api/monitoring/machine/:code/raw-data', async (ctx) => {
  const { code } = ctx.params;
  const page   = parseInt(ctx.query.get('page')   ?? '1');
  const limit  = parseInt(ctx.query.get('limit')  ?? '50');
  const filter = ctx.query.get('filter') ?? 'all';
  const offset = (page - 1) * limit;

  let where = 'WHERE s.machine_code = @code';
  if (filter === 'mapped') where += ` AND ${resolvedEmployeeCodeSql()} IS NOT NULL`;
  if (filter === 'unmapped') where += ` AND ${resolvedEmployeeCodeSql()} IS NULL`;

  const countRow = await query<any>(`
    SELECT COUNT(DISTINCT s.raw_device_user_id) AS total
    FROM attendance_scan_logs s
    ${where}
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);
  const total = countRow[0]?.total ?? 0;

  const rows = await query<any>(`
    SELECT TOP ${limit}
      s.raw_device_user_id AS raw_id,
      s.raw_user_sn,
      s.parsed_employee_code,
      NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
      ${resolvedEmployeeCodeSql()} AS employee_code,
      ${resolvedEmployeeNameSql()} AS employee_name,
      s.parsed_division_code,
      CASE WHEN ${resolvedEmployeeCodeSql()} IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
      ${resolvedMappingReasonSql()} AS mapping_reason,
      ${rawIdLengthSql()} AS raw_id_length,
      s.scan_time, s.scan_date, s.event_type, s.verify_type
    FROM attendance_scan_logs s
    ${where}
    ORDER BY s.scan_time DESC
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  sendJson(ctx.res, 200, {
    machine_code: code,
    filter,
    records: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── User Attendance History (aggregated by date) ─────────────────────────────────
route('GET', '/api/monitoring/machine/:code/user/:rawId/attendance', async (ctx) => {
  const { code, rawId } = ctx.params;
  const limit = parseInt(ctx.query.get('limit') ?? '30');

  const rows = await query<any>(`
    SELECT TOP ${limit}
      CAST(s.scan_date AS DATE) AS scan_date,
      MIN(s.scan_time) AS first_scan,
      CASE WHEN COUNT(DISTINCT CONVERT(VARCHAR(19), s.scan_time, 120)) >= 2 THEN MAX(s.scan_time) ELSE NULL END AS last_scan,
      COUNT(DISTINCT CONVERT(VARCHAR(19), s.scan_time, 120)) AS scan_count,
      ${resolvedEmployeeCodeSql()} AS employee_code,
      CASE WHEN ${resolvedEmployeeCodeSql()} IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
      ${resolvedMappingReasonSql()} AS mapping_reason,
      MIN(s.event_type) AS event_type,
      MIN(s.verify_type) AS verify_type
    FROM attendance_scan_logs s
    WHERE s.machine_code = @code
      AND s.raw_device_user_id = @rawId
    GROUP BY CAST(s.scan_date AS DATE), ${resolvedEmployeeCodeSql()}
    ORDER BY CAST(s.scan_date AS DATE) DESC
  `, [
    { name: 'code', type: sql.NVarChar, value: code },
    { name: 'rawId', type: sql.NVarChar, value: rawId },
  ]);

  const userInfo = await query<any>(`
    SELECT TOP 1
      s.raw_device_user_id,
      s.parsed_employee_code,
      NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
      ${resolvedEmployeeCodeSql()} AS employee_code,
      ${resolvedEmployeeNameSql()} AS employee_name,
      s.parsed_division_code,
      CASE WHEN ${resolvedEmployeeCodeSql()} IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
      ${resolvedMappingReasonSql()} AS mapping_reason,
      ${rawIdLengthSql()} AS raw_id_length
    FROM attendance_scan_logs s
    WHERE s.machine_code = @code AND s.raw_device_user_id = @rawId
  `, [
    { name: 'code', type: sql.NVarChar, value: code },
    { name: 'rawId', type: sql.NVarChar, value: rawId },
  ]);

  let employeeName = null;
  if (userInfo[0]?.employee_code) {
    const emp = await query<any>(`
      SELECT TOP 1 employee_name FROM employees WHERE employee_code = @code
    `, [{ name: 'code', type: sql.NVarChar, value: userInfo[0].employee_code }]);
    employeeName = emp[0]?.employee_name || null;
  }

  sendJson(ctx.res, 200, {
    machine_code: code,
    raw_id: rawId,
    user: userInfo[0] || null,
    employee_name: employeeName,
    attendance: rows.map((row: any) => ({
      date: row.scan_date,
      first_scan: row.first_scan,
      last_scan: row.last_scan,
      scan_count: row.scan_count,
      employee_code: row.employee_code,
      mapping_status: row.mapping_status,
      mapping_reason: row.mapping_reason,
      event_type: row.event_type,
      verify_type: row.verify_type,
      status: row.scan_count >= 2 ? 'HADIR' : (row.scan_count === 1 ? 'INCOMPLETE_SCAN' : 'TIDAK_HADIR'),
    })),
  });
});

// ─── Manual Map raw_id -> employee_code ────────────────────────────────────────
// Maps via employees.zkteco_user_id so all scan_logs resolve correctly.
// The parsed_employee_code in attendance_scan_logs is set from SSOT parser (immutable).
route('POST', '/api/monitoring/employees/:code/map', async (ctx) => {
  if (!requireAnyRole(ctx, ['HR_ADMIN', 'IT_ADMIN'], 'manual employee mapping')) return;
  const { code } = ctx.params;
  const parsed = (ctx.body ?? {}) as any;
  const { raw_id, machine_code } = parsed;

  if (!raw_id || !machine_code) {
    return sendError(ctx.res, 400, 'BAD_REQUEST', 'raw_id and machine_code are required');
  }
  const rawId = String(raw_id).trim();
  if (rawId.length < 5) {
    return sendError(ctx.res, 400, 'SHORT_RAW_ID_EXCLUDED', 'Raw ID shorter than 5 must appear for review only and cannot be mapped to employee code');
  }

  const emp = await query<any>(`
    SELECT id, employee_code, employee_name FROM employees WHERE employee_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);
  if (!emp.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Employee not found');

  // Upsert override mapping (for manual overrides that take precedence)
  await query(`
    MERGE INTO employee_mapping_overrides AS target
    USING (SELECT @rawId AS raw_id, @machineCode AS machine_code) AS source
    ON target.raw_device_id = source.raw_id AND target.machine_code = source.machine_code
    WHEN MATCHED THEN UPDATE SET employee_code = @code, mapped_by = 'manual', created_at = GETDATE()
    WHEN NOT MATCHED THEN INSERT (raw_device_id, machine_code, employee_code, mapped_by)
      VALUES (@rawId, @machineCode, @code, 'manual');
  `, [
    { name: 'rawId', type: sql.NVarChar, value: rawId },
    { name: 'machineCode', type: sql.NVarChar, value: machine_code },
    { name: 'code', type: sql.NVarChar, value: code },
  ]);

  // Update employees.zkteco_user_id so all scan_logs resolve to this employee
  await query(`
    UPDATE employees
    SET zkteco_user_id = @rawId,
        updated_at = SYSUTCDATETIME()
    WHERE employee_code = @code
  `, [
    { name: 'rawId', type: sql.NVarChar, value: rawId },
    { name: 'code', type: sql.NVarChar, value: code },
  ]);

  // Update existing scan logs with parsed_employee_code and current_emp_code
  await query(`
    UPDATE attendance_scan_logs
    SET parsed_employee_code = @code,
        current_emp_code = @code,
        employee_id = @empId,
        current_mapping_status = 'MAPPED',
        current_mapping_reason = 'manual_override_via_employees_zkteco_user_id',
        current_resolved_at = SYSUTCDATETIME()
    WHERE machine_code = @machineCode
      AND raw_device_user_id = @rawId
  `, [
    { name: 'rawId', type: sql.NVarChar, value: rawId },
    { name: 'machineCode', type: sql.NVarChar, value: machine_code },
    { name: 'code', type: sql.NVarChar, value: code },
    { name: 'empId', type: sql.Int, value: emp[0].id },
  ]);

  const countResult = await query<any>(`SELECT @@ROWCOUNT AS cnt`);
  await writeAudit({
    entityType: 'EMPLOYEE_MAPPING',
    entityId: `${machine_code}:${raw_id}`,
    employeeCode: code,
    actionType: 'MANUAL_MAP',
    reason: 'Manual device user mapping',
    changedBy: ctx.user?.id ?? null,
    ipAddress: ctx.req.socket.remoteAddress ?? null,
    userAgent: ctx.req.headers['user-agent'] ?? null,
  });

  sendJson(ctx.res, 200, {
    employee_code: code,
    raw_id,
    machine_code,
    updated_records: countResult[0]?.cnt ?? 0,
    message: 'Mapping applied: employees.zkteco_user_id updated and existing scan_logs backfilled',
  });
});

// ─── PowerShell helper ─────────────────────────────────────────────────────────
function runPowerShell(script: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = require('child_process').spawn(
      'powershell', ['-NoProfile', '-Command', script],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let stdout = '', stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code: number) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    setTimeout(() => { child.kill(); resolve({ stdout, stderr, exitCode: -1 }); }, 6000);
  });
}
