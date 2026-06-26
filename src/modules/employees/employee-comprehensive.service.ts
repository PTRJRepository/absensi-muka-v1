import { query, sql } from '../../lib/db';

// ─── Types (inline - backend has no shared types index) ──────────────────────

export type MappingStatus = 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW';

export interface EmployeeComprehensiveFilters {
  mode: 'datamesin' | 'database';
  divisionCode?: string | null;
  machineCode?: string | null;
  search?: string | null;
  mappingStatus?: MappingStatus | 'ALL' | null;
  startDate?: string | null;
  endDate?: string | null;
  page?: number;
  pageSize?: number;
}

export interface EmployeeComprehensiveRow {
  identity_key: string;
  raw_device_user_id: string | null;
  parsed_employee_code: string | null;
  current_emp_code: string | null;
  employee_code: string | null;
  nik: string | null;
  zkteco_user_name: string | null;
  employee_name: string | null;
  machine_code: string;
  division_code: string | null;
  gang_code: string | null;
  mapping_status: MappingStatus | 'ALL' | string;
  mapping_reason: string | null;
  scan_count: number;
  first_scan_at: string | null;
  last_scan_at: string | null;
  machine_codes?: string | null;
  machine_count?: number | null;
  batch_import?: string | null;
  total?: number;
}

export interface EmployeeComprehensiveResult {
  rows: EmployeeComprehensiveRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  meta: { mode: string; startDate?: string | null; endDate?: string | null; machineCode: string | null; divisionCode: string | null; mappingStatus: string };
}

export interface EmployeeComprehensiveKPI {
  totalUniqueUsers: number;
  mappedCount: number;
  unmappedCount: number;
  needReviewCount: number;
  ambiguousCount: number;
  mappedPercentage: number;
  totalScans: number;
  avgScansPerUser: number;
}

export interface EmployeeDetailRow extends EmployeeComprehensiveRow {
  division_name: string | null;
  hr_employee_code: string | null;
  hr_loc_code: string | null;
  hr_status: string | null;
  is_active: number | null;
  machine_name?: string | null;
  machine_count?: number | null;
  batch_import?: string | null;
}

export interface EmployeeScanRow {
  scan_log_id: number;
  scan_date: string;
  scan_time: string;
  raw_device_user_id: string | null;
  machine_code: string;
  parsed_employee_code: string | null;
  source: string;
  mapping_status: string;
  scan_direction: string | null;
  total_count?: number;
}

// ─── Resolution Helpers ────────────────────────────────────────────────────────
// employees table is now the SINGLE SOURCE OF TRUTH (SSOT).
// All employee identity data lives in employees. No more zkteco_hr_employee_map or
// zkteco_absensi_user_registry joins needed.
//
// Identity resolution order:
//   1. employees.parsed_employee_code  → result of SSOT parser on raw_device_user_id
//   2. employees.zkteco_user_id        → exact match on long raw ID
//   3. employees.current_emp_code        → latest code from HR snapshot (via NIK)

function resolvedEmployeeCodeSql(alias = 's') {
  return `COALESCE(
    NULLIF(${alias}.parsed_employee_code, ''),
    (
      SELECT TOP 1 e2.employee_code
      FROM dbo.employees e2
      WHERE e2.zkteco_user_id = LTRIM(RTRIM(CAST(${alias}.raw_device_user_id AS NVARCHAR(100))))
        AND e2.is_active = 1
      ORDER BY e2.id DESC
    )
  )`;
}

// ─── datamesin mode ─────────────────────────────────────────────────────────
// Shows raw device users with their employee identity resolution.
// Reads from: attendance_scan_logs → employees

async function queryDataMesinMode(filters: EmployeeComprehensiveFilters): Promise<{ rows: EmployeeComprehensiveRow[]; total: number }> {
  const { divisionCode, machineCode, search, mappingStatus, startDate, endDate, page, pageSize } = filters;
  const searchPattern = `%${search ?? ''}%`;
  const offset = ((page ?? 1) - 1) * (pageSize ?? 50);

  const rows = await query<EmployeeComprehensiveRow>(`
    WITH scan_source AS (
      SELECT
        s.machine_code,
        s.raw_device_user_id,
        NULLIF(s.parsed_employee_code, '') AS parsed_employee_code,
        NULLIF(s.zkteco_user_name, '') AS zkteco_user_name,
        s.mapping_reason,
        s.scan_time
      FROM attendance_scan_logs s
      WHERE s.scan_date >= @startDate
        AND s.scan_date <= @endDate
        AND (@machineCode IS NULL OR s.machine_code = @machineCode)
        AND (@search = '' OR s.raw_device_user_id LIKE @search
          OR NULLIF(s.parsed_employee_code, '') LIKE @search
          OR NULLIF(s.zkteco_user_name, '') LIKE @search)
    ),
    raw_users AS (
      SELECT
        s.machine_code,
        s.raw_device_user_id,
        s.parsed_employee_code,
        MAX(s.zkteco_user_name) AS zkteco_user_name,
        MAX(s.mapping_reason) AS mapping_reason,
        MAX(s.scan_time) AS last_scan_time,
        MIN(s.scan_time) AS first_scan_time,
        COUNT(*) AS scan_count
      FROM scan_source s
      GROUP BY s.machine_code, s.raw_device_user_id, s.parsed_employee_code
    ),
    mapped_users AS (
      SELECT
        ru.machine_code,
        ru.raw_device_user_id,
        ru.parsed_employee_code,
        ru.zkteco_user_name,
        ru.scan_count,
        ru.first_scan_time,
        ru.last_scan_time,
        ${resolvedEmployeeCodeSql('ru')} AS resolved_employee_code,
        e.id AS employee_id,
        e.employee_code AS db_employee_code,
        e.employee_name,
        e.nik,
        e.division_code,
        e.gang_code,
        e.current_emp_code,
        e.zkteco_user_name AS emp_zkteco_name,
        e.mapping_status AS emp_mapping_status,
        e.machine_codes,
        e.machine_count,
        e.batch_import,
        CASE
          WHEN ${resolvedEmployeeCodeSql('ru')} IS NOT NULL THEN 'MAPPED'
          WHEN ru.parsed_employee_code IS NULL THEN 'NEED_REVIEW'
          ELSE 'UNMAPPED'
        END AS mapping_status,
        CASE
          WHEN ${resolvedEmployeeCodeSql('ru')} IS NOT NULL THEN 'Resolved via employees table'
          WHEN ru.parsed_employee_code IS NOT NULL AND e.employee_code IS NOT NULL THEN 'Mapped via parsed_employee_code'
          WHEN ru.parsed_employee_code IS NULL THEN 'Raw device user ID cannot be parsed'
          ELSE 'No employee found in master table'
        END AS mapping_reason,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN @search != '' AND ru.raw_device_user_id LIKE @search THEN 0
                 WHEN @search != '' AND NULLIF(ru.parsed_employee_code, '') LIKE @search THEN 1
                 WHEN @search != '' AND ru.zkteco_user_name LIKE @search THEN 2
                 ELSE 3
            END,
            ru.machine_code,
            ru.raw_device_user_id
        ) AS rn,
        COUNT(*) OVER () AS total_count
      FROM raw_users ru
      LEFT JOIN employees e ON e.employee_code = ${resolvedEmployeeCodeSql('ru')}
      WHERE (@divisionCode IS NULL OR e.division_code = @divisionCode)
        AND (
          @mappingStatus = 'ALL'
          OR (@mappingStatus = 'MAPPED' AND ${resolvedEmployeeCodeSql('ru')} IS NOT NULL)
          OR (@mappingStatus = 'UNMAPPED' AND ${resolvedEmployeeCodeSql('ru')} IS NULL AND ru.parsed_employee_code IS NOT NULL)
          OR (@mappingStatus = 'NEED_REVIEW' AND ru.parsed_employee_code IS NULL)
        )
    )
    SELECT
      mu.machine_code + ':' + mu.raw_device_user_id AS identity_key,
      mu.raw_device_user_id,
      mu.parsed_employee_code,
      COALESCE(mu.current_emp_code, mu.resolved_employee_code) AS current_emp_code,
      mu.nik,
      mu.resolved_employee_code AS employee_code,
      COALESCE(mu.emp_zkteco_name, mu.zkteco_user_name) AS zkteco_user_name,
      mu.employee_name,
      mu.machine_code,
      mu.division_code,
      mu.gang_code,
      mu.mapping_status,
      mu.mapping_reason,
      mu.scan_count,
      CONVERT(VARCHAR(19), mu.first_scan_time, 126) AS first_scan_at,
      CONVERT(VARCHAR(19), mu.last_scan_time, 126) AS last_scan_at,
      mu.machine_codes,
      mu.machine_count,
      mu.batch_import,
      mu.total_count AS total
    FROM mapped_users mu
    WHERE mu.rn > @offset AND mu.rn <= (@offset + @pageSize)
    ORDER BY mu.rn
  `, [
    { name: 'startDate', type: sql.Date, value: startDate },
    { name: 'endDate', type: sql.Date, value: endDate },
    { name: 'machineCode', type: sql.NVarChar, value: machineCode },
    { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
    { name: 'search', type: sql.NVarChar, value: searchPattern },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'pageSize', type: sql.Int, value: pageSize ?? 50 },
  ]);

  const total = Number(rows[0]?.total ?? 0);
  return { rows, total };
}

// ─── database mode ────────────────────────────────────────────────────────────
// Shows employee master records.
// Reads from: employees

async function queryDatabaseMode(filters: EmployeeComprehensiveFilters): Promise<{ rows: EmployeeComprehensiveRow[]; total: number }> {
  const { divisionCode, machineCode, search, mappingStatus, page, pageSize } = filters;
  const searchPattern = `%${search ?? ''}%`;
  const offset = ((page ?? 1) - 1) * (pageSize ?? 50);

  const rows = await query<EmployeeComprehensiveRow>(`
    WITH ranked AS (
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        e.nik,
        e.division_code,
        e.gang_code,
        e.is_active,
        e.current_emp_code,
        e.zkteco_user_name,
        e.raw_device_user_id,
        e.parsed_employee_code,
        e.mapping_status AS emp_mapping_status,
        e.machine_codes,
        e.machine_count,
        e.batch_import,
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN @search != '' AND e.employee_code LIKE @search THEN 0
                 WHEN @search != '' AND e.employee_name LIKE @search THEN 1
                 WHEN @search != '' AND e.nik LIKE @search THEN 2
                 WHEN @search != '' AND e.current_emp_code LIKE @search THEN 3
                 ELSE 4
            END,
            e.employee_code
        ) AS rn,
        COUNT(*) OVER () AS total_count
      FROM employees e
      WHERE (@divisionCode IS NULL OR e.division_code = @divisionCode)
        AND (@search = '' OR e.employee_code LIKE @search
          OR e.employee_name LIKE @search
          OR e.nik LIKE @search
          OR e.current_emp_code LIKE @search
        )
        AND (
          @mappingStatus = 'ALL'
          OR (@mappingStatus = 'MAPPED' AND e.current_emp_code IS NOT NULL)
          OR (@mappingStatus = 'UNMAPPED' AND e.current_emp_code IS NULL)
        )
    )
    SELECT
      r.employee_code AS identity_key,
      r.raw_device_user_id,
      r.parsed_employee_code,
      r.current_emp_code,
      r.nik,
      r.employee_code,
      r.zkteco_user_name,
      r.employee_name,
      ISNULL(@machineCode, '') AS machine_code,
      r.division_code,
      r.gang_code,
      r.emp_mapping_status AS mapping_status,
      CASE
        WHEN r.current_emp_code IS NOT NULL THEN 'Mapped via HR snapshot'
        WHEN r.parsed_employee_code IS NOT NULL THEN 'Mapped via parsed_employee_code'
        ELSE 'Need review'
      END AS mapping_reason,
      0 AS scan_count,
      NULL AS first_scan_at,
      NULL AS last_scan_at,
      r.machine_codes,
      r.machine_count,
      r.batch_import,
      r.total_count AS total
    FROM ranked r
    WHERE r.rn > @offset AND r.rn <= (@offset + @pageSize)
    ORDER BY r.rn
  `, [
    { name: 'machineCode', type: sql.NVarChar, value: machineCode },
    { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
    { name: 'search', type: sql.NVarChar, value: searchPattern },
    { name: 'mappingStatus', type: sql.NVarChar, value: mappingStatus ?? 'ALL' },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'pageSize', type: sql.Int, value: pageSize ?? 50 },
  ]);

  const total = Number(rows[0]?.total ?? 0);
  return { rows, total };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getEmployeesComprehensive(filters: EmployeeComprehensiveFilters): Promise<EmployeeComprehensiveResult> {
  const { mode, divisionCode, machineCode, mappingStatus, startDate, endDate, page, pageSize } = filters;

  const { rows, total } = mode === 'datamesin'
    ? await queryDataMesinMode(filters)
    : await queryDatabaseMode(filters);

  return {
    rows,
    pagination: {
      page: page ?? 1,
      pageSize: pageSize ?? 50,
      total,
      totalPages: Math.ceil(total / (pageSize ?? 50)),
    },
    meta: {
      mode,
      startDate,
      endDate,
      machineCode: machineCode ?? null,
      divisionCode: divisionCode ?? null,
      mappingStatus: mappingStatus ?? 'ALL',
    },
  };
}

export async function getEmployeesComprehensiveKPIs(
  startDate: string,
  endDate: string,
  machineCode?: string | null,
  _divisionCode?: string | null
): Promise<EmployeeComprehensiveKPI> {
  const rows = await query<{
    total_users: number;
    mapped: number;
    need_review: number;
    total_scans: number;
  }>(`
    SELECT
      COUNT(DISTINCT s.machine_code + ':' + s.raw_device_user_id) AS total_users,
      SUM(CASE WHEN NULLIF(s.parsed_employee_code, '') IS NOT NULL THEN 1 ELSE 0 END) AS mapped,
      SUM(CASE WHEN NULLIF(s.parsed_employee_code, '') IS NULL THEN 1 ELSE 0 END) AS need_review,
      COUNT(*) AS total_scans
    FROM attendance_scan_logs s
    WHERE s.scan_date >= @startDate
      AND s.scan_date <= @endDate
      AND (@machineCode IS NULL OR s.machine_code = @machineCode)
  `, [
    { name: 'startDate', type: sql.Date, value: startDate },
    { name: 'endDate', type: sql.Date, value: endDate },
    { name: 'machineCode', type: sql.NVarChar, value: machineCode },
  ]);

  const stats = rows[0] ?? { total_users: 0, mapped: 0, need_review: 0, total_scans: 0 };
  const mappedCount = Number(stats.mapped ?? 0);
  const needReviewCount = Number(stats.need_review ?? 0);
  const totalUsers = Number(stats.total_users ?? 0);

  return {
    totalUniqueUsers: totalUsers,
    mappedCount,
    unmappedCount: totalUsers - mappedCount - needReviewCount,
    needReviewCount,
    ambiguousCount: 0,
    mappedPercentage: totalUsers > 0 ? Math.round((mappedCount / totalUsers) * 100) : 0,
    totalScans: Number(stats.total_scans ?? 0),
    avgScansPerUser: totalUsers > 0 ? Math.round((Number(stats.total_scans ?? 0) / totalUsers) * 10) / 10 : 0,
  };
}

export async function getEmployeeDetail(
  employeeCode: string,
  _startDate: string,
  _endDate: string
): Promise<EmployeeDetailRow | null> {
  const rows = await query<EmployeeDetailRow>(`
    SELECT TOP 1
      e.employee_code AS identity_key,
      e.raw_device_user_id,
      NULLIF(e.parsed_employee_code, '') AS parsed_employee_code,
      e.employee_code,
      e.zkteco_user_name,
      e.employee_name,
      COALESCE(e.machine_codes, '') AS machine_codes,
      e.division_code,
      d.division_name,
      e.gang_code,
      e.nik,
      e.current_emp_code,
      e.batch_import,
      e.machine_count,
      CASE
        WHEN e.current_emp_code IS NOT NULL THEN 'MAPPED'
        WHEN e.parsed_employee_code IS NOT NULL THEN 'MAPPED'
        ELSE 'NEED_REVIEW'
      END AS mapping_status,
      CASE
        WHEN e.current_emp_code IS NOT NULL THEN 'Resolved via HR snapshot'
        WHEN e.parsed_employee_code IS NOT NULL THEN 'Mapped via parsed_employee_code'
        ELSE 'No HR mapping'
      END AS mapping_reason,
      0 AS scan_count,
      NULL AS first_scan_at,
      NULL AS last_scan_at,
      e.hr_employee_code,
      e.hr_loc_code,
      e.hr_status,
      e.is_active
    FROM employees e
    LEFT JOIN divisions d ON d.id = e.division_id
    WHERE e.employee_code = @employeeCode
  `, [{ name: 'employeeCode', type: sql.NVarChar, value: employeeCode }]);

  return rows[0] ?? null;
}

export async function getEmployeeScans(
  employeeCode: string,
  startDate: string,
  endDate: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ rows: EmployeeScanRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const offset = (page - 1) * pageSize;

  const rows = await query<EmployeeScanRow>(`
    SELECT
      s.id AS scan_log_id,
      CONVERT(VARCHAR(10), s.scan_date, 126) AS scan_date,
      CONVERT(VARCHAR(19), s.scan_time, 126) AS scan_time,
      s.raw_device_user_id,
      s.machine_code,
      NULLIF(s.parsed_employee_code, '') AS parsed_employee_code,
      s.source,
      s.mapping_status,
      s.scan_direction,
      COUNT(*) OVER () AS total_count
    FROM attendance_scan_logs s
    WHERE s.parsed_employee_code = @employeeCode
      AND s.scan_date >= @startDate
      AND s.scan_date <= @endDate
    ORDER BY s.scan_date DESC, s.scan_time DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `, [
    { name: 'employeeCode', type: sql.NVarChar, value: employeeCode },
    { name: 'startDate', type: sql.Date, value: startDate },
    { name: 'endDate', type: sql.Date, value: endDate },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'pageSize', type: sql.Int, value: pageSize },
  ]);

  const total = Number(rows[0]?.total_count ?? 0);

  return {
    rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
