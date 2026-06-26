import mssql from 'mssql';

const absensiConfig: mssql.config = {
  server: process.env.DB_SERVER ?? '10.0.0.110',
  port: parseInt(process.env.DB_PORT ?? '1433', 10),
  user: process.env.DB_USER ?? 'sa',
  password: process.env.DB_PASSWORD ?? '<DB_PASSWORD>',
  database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

const hrConfig: mssql.config = {
  server: process.env.HR_DB_SERVER ?? '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD ?? '<DB_PASSWORD>',
  database: 'DB_PTRJ',
  options: { encrypt: false, trustServerCertificate: true },
};

async function syncEmployeesFromHR() {
  console.log('=== Syncing Employees from HR_EMPLOYEE ===\n');

  const absensi = await mssql.connect(absensiConfig);
  const hr = await mssql.connect(hrConfig);

  // Get HR_EMPLOYEE data
  console.log('Fetching HR_EMPLOYEE data...');
  const hrResult = await hr.request().query(`
    SELECT
      RTRIM(EmpCode) as EmpCode,
      RTRIM(EmpName) as EmpName,
      RTRIM(LocCode) as LocCode,
      Status
    FROM dbo.HR_EMPLOYEE
    WHERE Status = '1'
  `);
  const hrEmployees = hrResult.recordset;
  console.log(`Found ${hrEmployees.length} active employees in HR_EMPLOYEE\n`);

  // Get divisions for mapping
  const divResult = await absensi.request().query(`SELECT id, division_code FROM divisions`);
  const divMap = new Map<string, number>();
  divResult.recordset.forEach((d: any) => {
    divMap.set(d.division_code, d.id);
  });

  // Current count
  const beforeResult = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees`);
  console.log(`Current employees: ${beforeResult.recordset[0].cnt}\n`);

  // Build values for INSERT
  const values = hrEmployees.map((e: any) => {
    const divId = divMap.get(e.LocCode) || 'NULL';
    return `('${e.EmpCode}', '${e.EmpName.replace(/'/g, "''")}', ${divId}, NULL, 'ACTIVE', 1)`;
  });

  // Batch upsert using MERGE
  console.log('Batch upserting employees...');
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < hrEmployees.length; i += batchSize) {
    const batch = hrEmployees.slice(i, i + batchSize);
    const batchValues = batch.map((e: any) => {
      const divId = divMap.get(e.LocCode) || 'NULL';
      return `SELECT '${e.EmpCode}' as emp_code, '${e.EmpName.replace(/'/g, "''")}' as emp_name, ${divId} as div_id`;
    }).join(' UNION ALL ');

    await absensi.request().query(`
      MERGE INTO employees AS target
      USING (
        SELECT emp_code, emp_name, div_id FROM (
          ${batchValues}
        ) AS src(emp_code, emp_name, div_id)
      ) AS source ON target.employee_code = source.emp_code
      WHEN MATCHED THEN
        UPDATE SET
          employee_name = source.emp_name,
          -- division_id intentionally NOT updated — resolved via hr_loc_code at sync time
          is_active = 1,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (employee_code, employee_name, division_id, gang_id, employment_status, is_active, created_at)
        VALUES (source.emp_code, source.emp_name, NULL, NULL, 'ACTIVE', 1, SYSUTCDATETIME());
    `);

    processed += batch.length;
    if (processed % 500 === 0 || processed === hrEmployees.length) {
      console.log(`  Processed ${processed}/${hrEmployees.length}`);
    }
  }

  // Deactivate employees not in HR
  const hrCodes = hrEmployees.map((e: any) => `'${e.EmpCode}'`).join(',');
  await absensi.request().query(`
    UPDATE employees SET is_active = 0, updated_at = SYSUTCDATETIME()
    WHERE employee_code NOT IN (${hrCodes}) AND is_active = 1
  `);

  // Final count
  const afterResult = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees WHERE is_active = 1`);
  const inactiveResult = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees WHERE is_active = 0`);

  console.log('\n=== Summary ===');
  console.log(`  HR Employees: ${hrEmployees.length}`);
  console.log(`  Active employees now: ${afterResult.recordset[0].cnt}`);
  console.log(`  Inactive employees: ${inactiveResult.recordset[0].cnt}`);

  // Sample
  console.log('\n=== Sample Employees ===');
  const sample = await absensi.request().query(`
    SELECT TOP 20 employee_code, employee_name
    FROM employees WHERE is_active = 1
    ORDER BY employee_code
  `);
  sample.recordset.forEach((e: any) => console.log(`  ${e.employee_code} - ${e.employee_name}`));

  await absensi.close();
  await hr.close();
  console.log('\nDone!');
}

syncEmployeesFromHR().catch(console.error);
