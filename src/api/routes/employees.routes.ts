import { z } from 'zod';
import { execute, query, sql } from '../../lib/db';
import { route, validate } from '../router';
import { sendJson, sendError } from '../response';

const employeeSchema = z.object({ employeeCode: z.string().min(1), employeeName: z.string().min(1), divisionCode: z.string().min(1), gangCode: z.string().optional().nullable(), isActive: z.boolean().optional() });

route('GET', '/api/employees', async (ctx) => {
  const page = Math.max(Number(ctx.query.get('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.get('pageSize') ?? 25), 1), 100);
  const search = `%${ctx.query.get('search') ?? ''}%`;
  const divisionCode = ctx.query.get('divisionCode');
  // Default to show only active employees
  const showOnlyActive = ctx.query.get('includeInactive') !== 'true';

  // Check if new columns exist
  const hasNikColumn = await checkColumnExists('employees', 'nik');
  const hasQualityColumn = await checkColumnExists('employees', 'data_quality_status');

  let selectCols = `
    e.id, e.employee_code, e.employee_name,
    d.division_code, d.division_name,
    'N/A' AS gang_code,
    e.is_active,
    e.nik, e.current_emp_code, e.current_emp_name,
    e.hr_status, e.hr_verified,
    e.data_quality_status, e.data_quality_reason,
    e.batch_import, e.machine_codes,
    e.is_raw_id
  `;

  // Filter to only VALID_STANDARD_FORMAT and active by default
  let whereClause = `e.is_active = 1 AND e.data_quality_status = 'VALID_STANDARD_FORMAT'`;
  if (search !== '%%') whereClause += ` AND (e.employee_code LIKE @search OR e.employee_name LIKE @search)`;
  if (divisionCode) whereClause += ` AND d.division_code=@divisionCode`;

  const rows = await query(`
    SELECT ${selectCols}
    FROM employees e
    JOIN divisions d ON d.id=e.division_id
    WHERE ${whereClause}
    ORDER BY e.employee_code
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `, [
    { name: 'search', type: sql.NVarChar, value: search },
    { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
    { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
    { name: 'pageSize', type: sql.Int, value: pageSize },
  ]);

  // Get total count
  const countResult = await query<{ total: number }>(`
    SELECT COUNT(*) as total FROM employees e
    JOIN divisions d ON d.id=e.division_id
    WHERE ${whereClause}
  `, [
    { name: 'search', type: sql.NVarChar, value: search },
    { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
  ]);

  const totalCount = Array.isArray(countResult) ? countResult[0]?.total ?? 0 : 0;

  sendJson(ctx.res, 200, {
    data: rows,
    pagination: {
      page,
      pageSize,
      total: totalCount,
    },
  });
});

/**
 * Helper: Check if column exists in table
 */
async function checkColumnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @table AND COLUMN_NAME = @column
    `, [
      { name: 'table', type: sql.NVarChar, value: table },
      { name: 'column', type: sql.NVarChar, value: column },
    ]);
    return result.length > 0;
  } catch {
    return false;
  }
}

route('GET', '/api/employees/:id', async (ctx) => {
  const id = Number(ctx.params.id);

  // Build SELECT with all currentEmpCode + batch_import + machine_codes columns
  const selectCols = `
    e.id, e.employee_code, e.employee_name, e.is_active,
    e.nik, e.current_emp_code, e.current_emp_name,
    e.hr_status, e.hr_loc_code, e.hr_verified, e.hr_verified_at,
    e.data_quality_status, e.data_quality_reason,
    e.batch_import, e.machine_codes,
    e.is_raw_id, e.identity_source, e.identity_resolution_reason,
    d.division_code, d.division_name,
    'N/A' AS gang_code
  `;

  const rows = await query<any>(`SELECT ${selectCols} FROM employees e LEFT JOIN divisions d ON d.id=e.division_id WHERE e.id=@id`, [
    { name: 'id', type: sql.Int, value: id },
  ]);

  if (rows.length === 0) {
    sendError(ctx.res, 404, 'NOT_FOUND', 'Employee not found');
    return;
  }

  const employee = rows[0];

  // Get machine codes from employees.machine_codes (comma-separated)
  const machineCodes = employee.machine_codes
    ? employee.machine_codes.split(',').filter(Boolean)
    : [];

  // Enrich with machine names from attendance_machines
  let machines: any[] = [];
  if (machineCodes.length > 0) {
    const placeholders = machineCodes.map((_: any, i: number) => `@m${i}`).join(',');
    const machParams = machineCodes.map((c: string, i: number) => ({ name: `m${i}`, type: sql.NVarChar as any, value: c }));
    const machRows = await query<any>(`
    SELECT machine_code, machine_name, location FROM attendance_machines
      WHERE machine_code IN (${placeholders})
    `, machParams);
    machines = machineCodes.map((code: string) => {
      const found = machRows.find((m: any) => m.machine_code === code);
      return {
        machine_code: code,
        machine_name: found?.machine_name ?? code,
        location: found?.location ?? null,
      };
    });
  }

  (employee as any).machines = machines;
  (employee as any).machine_codes = machineCodes;
  (employee as any).machine_count = machineCodes.length;

  sendJson(ctx.res, 200, employee);
});

/**
 * Helper: Check if table exists
 */
async function checkTableExists(table: string): Promise<boolean> {
  try {
    const result = await query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @table
    `, [
      { name: 'table', type: sql.NVarChar, value: table },
    ]);
    return result.length > 0;
  } catch {
    return false;
  }
}

route('POST', '/api/employees', async (ctx) => {
  const input = validate(employeeSchema, ctx.body);
  await execute(`INSERT INTO employees(employee_code,employee_name,division_id,gang_id,is_active)
    SELECT @employeeCode,@employeeName,d.id,NULL,@isActive FROM divisions d WHERE d.division_code=@divisionCode`, [
    { name: 'employeeCode', type: sql.NVarChar, value: input.employeeCode }, { name: 'employeeName', type: sql.NVarChar, value: input.employeeName }, { name: 'divisionCode', type: sql.NVarChar, value: input.divisionCode }, { name: 'isActive', type: sql.Bit, value: input.isActive ?? true },
  ]);
  sendJson(ctx.res, 201, { created: true });
});

route('PUT', '/api/employees/:id', async (ctx) => {
  const input = validate(employeeSchema, ctx.body);
  await execute(`UPDATE employees SET employee_code=@employeeCode, employee_name=@employeeName, division_id=(SELECT id FROM divisions WHERE division_code=@divisionCode), gang_id=NULL, is_active=@isActive, updated_at=SYSUTCDATETIME() WHERE id=@id`, [
    { name: 'id', type: sql.Int, value: Number(ctx.params.id) }, { name: 'employeeCode', type: sql.NVarChar, value: input.employeeCode }, { name: 'employeeName', type: sql.NVarChar, value: input.employeeName }, { name: 'divisionCode', type: sql.NVarChar, value: input.divisionCode }, { name: 'isActive', type: sql.Bit, value: input.isActive ?? true },
  ]);
  sendJson(ctx.res, 200, { updated: true });
});

/**
 * GET /api/employees/:code/machines
 * Get machines for an employee
 */
route('GET', '/api/employees/:code/machines', async (ctx) => {
  const code = ctx.params.code;

  // Get machine_codes from employees table (no more enrollment table)
  const rows = await query(`
    SELECT e.machine_codes, e.employee_code
    FROM employees e
    WHERE e.employee_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  if (rows.length === 0) {
    sendError(ctx.res, 404, 'NOT_FOUND', 'Employee not found');
    return;
  }

  const row = rows[0] as any;
  const machineCodes = row.machine_codes
    ? String(row.machine_codes).split(',').filter(Boolean)
    : [];

  // Enrich with machine names
  let machines: any[] = [];
  if (machineCodes.length > 0) {
    const placeholders = machineCodes.map((_: any, i: number) => `@m${i}`).join(',');
    const machParams = machineCodes.map((c: string, i: number) => ({ name: `m${i}`, type: sql.NVarChar as any, value: c }));
    const machRows = await query<any>(`
    SELECT machine_code, machine_name, location FROM attendance_machines
      WHERE machine_code IN (${placeholders})
    `, machParams);
    machines = machineCodes.map((mc: string) => {
      const found = machRows.find((m: any) => m.machine_code === mc);
      return {
        machine_code: mc,
        machine_name: found?.machine_name ?? mc,
        location: found?.location ?? null,
      };
    });
  }

  sendJson(ctx.res, 200, {
    employee_code: code,
    machine_count: machines.length,
    machines,
  });
});

/**
 * GET /api/employees/master-clean
 * Get clean employee master with machine codes array
 */
route('GET', '/api/employees/master-clean', async (ctx) => {
  const page = Math.max(Number(ctx.query.get('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.get('pageSize') ?? 50), 1), 100);
  const divisionCode = ctx.query.get('divisionCode');
  const search = `%${ctx.query.get('search') ?? ''}%`;

  // Check if view exists
  const viewExists = await checkTableExists('vw_employee_master_clean');

  if (!viewExists) {
    sendError(ctx.res, 500, 'VIEW_NOT_AVAILABLE', 'Master clean view not available. Run migration 043 first.');
    return;
  }

  const rows = await query(`
    SELECT *
    FROM vw_employee_master_clean
    WHERE (employee_code LIKE @search OR employee_name LIKE @search)
      AND (@divisionCode IS NULL OR division_code = @divisionCode)
    ORDER BY employee_code
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `, [
    { name: 'search', type: sql.NVarChar, value: search },
    { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
    { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
    { name: 'pageSize', type: sql.Int, value: pageSize },
  ]);

  // Parse machine_codes from comma-separated string to array
  const data = rows.map((row: any) => ({
    ...row,
    machine_codes: row.machine_codes ? row.machine_codes.split(',') : [],
    raw_device_user_ids: row.raw_device_user_ids ? row.raw_device_user_ids.split(',') : [],
  }));

  sendJson(ctx.res, 200, {
    data,
    pagination: { page, pageSize },
  });
});

/**
 * GET /api/employees/:id/detail
 * Get employee detail with code history and machine enrollments
 */
route('GET', '/api/employees/:id/detail', async (ctx) => {
  const id = ctx.params.id;
  const idType = ctx.query.get('idType') || 'id'; // 'id' or 'nik'

  try {
    let employee: Record<string, unknown> | null = null;
    let codeHistory: Record<string, unknown>[] = [];
    let machineEnrollments: Record<string, unknown>[] = [];

    if (idType === 'nik') {
      // Lookup by NIK
      const normalizedNik = id.trim().replace(/\s+/g, '');

      // Get employee from hr_reference (current)
      const snapshotRows = await query<Record<string, unknown>>(`
        SELECT
          id,
          nik,
          emp_code AS current_emp_code,
          emp_name AS current_emp_name,
          loc_code AS current_loc_code,
          hr_status AS current_status,
          create_date AS current_create_date,
          update_date AS current_update_date,
          synced_at
        FROM hr_reference
        WHERE type = 'current' AND nik = @nik
      `, [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]);

      if (snapshotRows.length > 0) {
        const snapshot = snapshotRows[0];
        employee = {
          employeeId: snapshot.id,
          currentEmpCode: snapshot.current_emp_code,
          employeeName: snapshot.current_emp_name,
          nik: snapshot.nik,
          nikMasked: maskNik(snapshot.nik as string),
          locCode: snapshot.current_loc_code,
          status: snapshot.current_status,
          createDate: snapshot.current_create_date,
          updateDate: snapshot.current_update_date,
        };

        // Get code history for this NIK
        codeHistory = await query<Record<string, unknown>>(`
          SELECT
            id,
            nik,
            emp_code,
            emp_name,
            loc_code,
            hr_status,
            create_date,
            update_date,
            is_current,
            source_table,
            synced_at
          FROM hr_reference
          WHERE type = 'history' AND nik = @nik
          ORDER BY is_current DESC, update_date DESC, create_date DESC
        `, [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]);

        // Get machine enrollments
        machineEnrollments = await getMachineEnrollmentsByEmpCode(snapshot.current_emp_code as string);
      }
    } else {
      // Lookup by employee ID (numeric)
      const employeeId = Number(id);

      // Get employee from employees table
      const employeeRows = await query<Record<string, unknown>>(`
        SELECT
          e.id,
          e.employee_code,
          e.employee_name,
          e.nik,
          e.is_active,
          d.division_code,
          d.division_name,
          'N/A' AS gang_code,
          e.created_at,
          e.updated_at
        FROM employees e
        JOIN divisions d ON d.id = e.division_id
        WHERE e.id = @id
      `, [{ name: 'id', type: sql.Int, value: employeeId }]);

      if (employeeRows.length > 0) {
        const emp = employeeRows[0];
        employee = {
          employeeId: emp.id,
          currentEmpCode: emp.employee_code,
          employeeName: emp.employee_name,
          nik: emp.nik || null,
          nikMasked: emp.nik ? maskNik(emp.nik as string) : null,
          divisionCode: emp.division_code,
          divisionName: emp.division_name,
          gangCode: emp.gang_code,
          isActive: emp.is_active,
          createDate: emp.created_at,
          updateDate: emp.updated_at,
        };

        // Get code history from hr_reference if NIK exists
        if (emp.nik) {
          const normalizedNik = (emp.nik as string).trim().replace(/\s+/g, '');

          codeHistory = await query<Record<string, unknown>>(`
            SELECT
              id,
              nik,
              emp_code,
              emp_name,
              loc_code,
              hr_status,
              create_date,
              update_date,
              is_current,
              source_table,
              synced_at
            FROM hr_reference
            WHERE type = 'history' AND nik = @nik
            ORDER BY is_current DESC, update_date DESC, create_date DESC
          `, [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]);
        }

        // Get machine enrollments
        machineEnrollments = await getMachineEnrollmentsByEmpCode(emp.employee_code as string);
      }
    }

    if (!employee) {
      sendError(ctx.res, 404, 'NOT_FOUND', 'Employee not found');
      return;
    }

    sendJson(ctx.res, 200, {
      ...employee,
      codeHistory: codeHistory.map((h) => ({
        id: h.id,
        empCode: h.emp_code,
        empName: h.emp_name,
        locCode: h.loc_code,
        status: h.hr_status,
        isCurrent: Boolean(h.is_current),
        createDate: h.create_date,
        updateDate: h.update_date,
        sourceTable: h.source_table,
        syncedAt: h.synced_at,
      })),
      machineEnrollments: machineEnrollments.map((e) => ({
        rawDeviceUserId: e.raw_device_user_id,
        parsedCode: e.parsed_employee_code,
        currentEmpCode: e.hr_employee_code,
        machineCode: e.machine_code,
        machineName: e.machine_name,
        zktecoUserName: e.zkteco_user_name,
        mappingStatus: e.mapping_status,
        firstSeenAt: e.first_seen_at,
        lastSeenAt: e.last_seen_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching employee detail:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee detail');
  }
});

/**
 * GET /api/employees/by-nik/:nik
 * Get employee detail by NIK with code history
 */
route('GET', '/api/employees/by-nik/:nik', async (ctx) => {
  const nik = ctx.params.nik;

  if (!nik) {
    sendError(ctx.res, 400, 'MISSING_PARAMETER', 'NIK is required');
    return;
  }

  try {
    const normalizedNik = nik.trim().replace(/\s+/g, '');

    // Get from hr_reference (current)
    const snapshotRows = await query<Record<string, unknown>>(`
      SELECT
        id,
        nik,
        emp_code AS current_emp_code,
        emp_name AS current_emp_name,
        loc_code AS current_loc_code,
        hr_status AS current_status,
        create_date AS current_create_date,
        update_date AS current_update_date,
        synced_at
      FROM hr_reference
      WHERE type = 'current' AND nik = @nik
    `, [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]);

    if (snapshotRows.length === 0) {
      sendError(ctx.res, 404, 'NOT_FOUND', 'Employee with NIK not found');
      return;
    }

    const snapshot = snapshotRows[0];
    const employee = {
      employeeId: snapshot.id,
      currentEmpCode: snapshot.current_emp_code,
      employeeName: snapshot.current_emp_name,
      nik: snapshot.nik,
      nikMasked: maskNik(snapshot.nik as string),
      locCode: snapshot.current_loc_code,
      status: snapshot.current_status,
      createDate: snapshot.current_create_date,
      updateDate: snapshot.current_update_date,
    };

    // Get code history
    const codeHistory = await query<Record<string, unknown>>(`
      SELECT
        id,
        nik,
        emp_code,
        emp_name,
        loc_code,
        hr_status,
        create_date,
        update_date,
        is_current,
        source_table,
        synced_at
      FROM hr_reference
      WHERE type = 'history' AND nik = @nik
      ORDER BY is_current DESC, update_date DESC, create_date DESC
    `, [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]);

    // Get machine enrollments
    const machineEnrollments = await getMachineEnrollmentsByEmpCode(snapshot.current_emp_code as string);

    sendJson(ctx.res, 200, {
      ...employee,
      codeHistory: codeHistory.map((h) => ({
        id: h.id,
        empCode: h.emp_code,
        empName: h.emp_name,
        locCode: h.loc_code,
        status: h.hr_status,
        isCurrent: Boolean(h.is_current),
        createDate: h.create_date,
        updateDate: h.update_date,
        sourceTable: h.source_table,
        syncedAt: h.synced_at,
      })),
      machineEnrollments: machineEnrollments.map((e) => ({
        rawDeviceUserId: e.raw_device_user_id,
        parsedCode: e.parsed_employee_code,
        currentEmpCode: e.hr_employee_code,
        machineCode: e.machine_code,
        machineName: e.machine_name,
        zktecoUserName: e.zkteco_user_name,
        mappingStatus: e.mapping_status,
        firstSeenAt: e.first_seen_at,
        lastSeenAt: e.last_seen_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching employee by NIK:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee by NIK');
  }
});

/**
 * Helper: Mask NIK for display (show first 4 and last 4 digits)
 */
function maskNik(nik: string | null): string {
  if (!nik) return '-';
  const str = nik.replace(/\s+/g, '');
  if (str.length <= 8) return str;
  return str.substring(0, 4) + '*'.repeat(str.length - 8) + str.substring(str.length - 4);
}

/**
 * Helper: Get machine enrollments for an employee code
 */
async function getMachineEnrollmentsByEmpCode(empCode: string): Promise<any[]> {
  const rows = await query<any>(`
    SELECT e.machine_codes FROM employees e WHERE e.employee_code = @empCode
  `, [{ name: 'empCode', type: sql.NVarChar, value: empCode }]);

  if (!rows[0]?.machine_codes) return [];

  const machineCodes = String(rows[0].machine_codes).split(',').filter(Boolean);
  if (machineCodes.length === 0) return [];

  const placeholders = machineCodes.map((_: any, i: number) => `@m${i}`).join(',');
  const machParams = machineCodes.map((c: string, i: number) => ({ name: `m${i}`, type: sql.NVarChar as any, value: c }));
  const machRows = await query<any>(`
  SELECT machine_code, machine_name, location FROM attendance_machines
    WHERE machine_code IN (${placeholders})
  `, machParams);

  return machineCodes.map((mc: string) => {
    const found = machRows.find((m: any) => m.machine_code === mc);
    return { machine_code: mc, machine_name: found?.machine_name ?? mc, location: found?.location ?? null };
  });
}
