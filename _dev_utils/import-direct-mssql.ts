/**
 * Import attendance data from exported JSON files to database
 * Database: rebinmas_absensi_monitoring
 * Uses direct mssql connection
 *
 * IMPORTANT: emp_code parsing uses loc_code prefix from machine-config
 * Format: {locCode}{last 4 digits of userId}
 * Example: P1A (locCode=A), userId="10044" -> "A0044"
 *
 * FEATURE: Imports ALL records, no skipping of existing data
 */

import mssql from 'mssql';
import fs from 'fs';

const dbConfig = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

// Machine code to division_id and loc_code mapping
const machineMapping: Record<string, { divisionId: number; locCode: string; scannerCode: number | null }> = {
  'OFFICE_PGE': { divisionId: 14, locCode: 'A', scannerCode: null },
  'MILL':       { divisionId: 14, locCode: 'A', scannerCode: null },
  'OFFICE_APE':  { divisionId: 7, locCode: 'F', scannerCode: null },
  'IJL':         { divisionId: 13, locCode: 'L', scannerCode: null },
  'AB2':         { divisionId: 9, locCode: 'H', scannerCode: 400 },
  'P1A':         { divisionId: 2, locCode: 'A', scannerCode: 100 },
  'P1B':         { divisionId: 3, locCode: 'B', scannerCode: 300 },
};

/**
 * Convert userId/employeeId to emp_code
 * Logic: locCode + last 4 digits of userId
 */
function userIdToEmpCode(userId: string | number, locCode: string): string {
  const id = String(userId);

  // If already formatted (e.g., "A0044")
  if (/^[A-Z]\d+$/.test(id)) {
    return id;
  }

  // Extract last 4 digits, stripping scanner code prefix if present
  const last4Match = id.match(/\d{1,4}$/);
  if (last4Match) {
    const numPart = last4Match[0].padStart(4, '0');
    return `${locCode}${numPart}`;
  }

  return `${locCode}${id}`;
}

async function importUsers(pool: mssql.ConnectionPool, machineName: string, users: any[]): Promise<number> {
  console.log(`\n[${machineName}] Importing ${users.length} users...`);

  const mapping = machineMapping[machineName] || { divisionId: 14, locCode: 'X' };
  const { divisionId, locCode } = mapping;

  let imported = 0;
  let errors = 0;

  for (const user of users) {
    const rawUserId = String(user.userId || user.uid);
    const empCode = userIdToEmpCode(rawUserId, locCode);
    const empName = (user.name || rawUserId).replace(/'/g, "''");

    try {
      // UPSERT - insert or update if exists
      await pool.request()
        .input('empCode', empCode)
        .input('empName', empName)
        .input('divisionId', divisionId)
        .query(`
          MERGE employees AS target
          USING (SELECT @empCode AS employee_code) AS source
          ON target.employee_code = source.employee_code
          WHEN MATCHED THEN
            UPDATE SET employee_name = @empName
          WHEN NOT MATCHED THEN
            INSERT (employee_code, employee_name, division_id, employment_status, is_active, created_at)
            VALUES (@empCode, @empName, @divisionId, 'ACTIVE', 1, GETDATE());
        `);
      imported++;
    } catch (e: any) {
      errors++;
      if (errors <= 2) console.log(`  Error ${empCode}: ${e.message.substring(0, 60)}`);
    }
  }

  console.log(`[${machineName}] ✓ Imported/Updated ${imported} users (${errors} errors)`);
  return imported;
}

async function importAttendances(pool: mssql.ConnectionPool, machineName: string, attendances: any[]): Promise<number> {
  console.log(`\n[${machineName}] Importing ${attendances.length} attendances...`);

  const mapping = machineMapping[machineName] || { divisionId: 14, locCode: 'X' };
  const { locCode } = mapping;

  // Create batch
  const batchCode = `ZKTECO-${machineName}-${Date.now()}`;

  try {
    await pool.request()
      .input('batchCode', batchCode)
      .input('machineName', machineName)
      .input('totalRecords', attendances.length)
      .query(`
        INSERT INTO attendance_import_batches (batch_code, source, machine_code, records_total, status, started_at)
        VALUES (@batchCode, 'DIRECT_ZKTECO', @machineName, @totalRecords, 'RUNNING', GETDATE())
      `);
    console.log(`[${machineName}] ✓ Batch created: ${batchCode}`);
  } catch (e: any) {
    console.log(`[${machineName}] Batch error: ${e.message.substring(0, 80)}`);
  }

  let inserted = 0;
  let duplicates = 0;
  const chunkSize = 100;

  for (let i = 0; i < attendances.length; i += chunkSize) {
    const chunk = attendances.slice(i, i + chunkSize);
    const values = chunk.map((att: any) => {
      const rawUserId = String(att.deviceUserId);
      const empCode = userIdToEmpCode(rawUserId, locCode);
      const recordTime = new Date(att.recordTime);
      const workDate = recordTime.toISOString().split('T')[0];
      const ip = att.ip || '';

      return `(
        NULL,
        N'${machineName}',
        N'${rawUserId}',
        N'${att.userSn || ''}',
        '${recordTime.toISOString()}',
        N'${ip}',
        N'${empCode}',
        NULL,
        N'MAPPED',
        NULL,
        '${recordTime.toISOString()}',
        '${workDate}',
        NULL,
        NULL,
        NULL,
        (SELECT TOP 1 id FROM attendance_import_batches WHERE batch_code = '${batchCode}'),
        GETDATE()
      )`;
    }).join(',');

    try {
      await pool.request().query(`
        INSERT INTO attendance_scan_logs (
          machine_id, machine_code, raw_device_user_id, raw_user_sn,
          raw_record_time, raw_ip, parsed_employee_code, parsed_division_code,
          mapping_status, mapping_reason, scan_time, scan_date,
          event_type, verify_type, work_code, sync_batch_id, created_at
        )
        VALUES ${values}
      `);
      inserted += chunk.length;
    } catch (e: any) {
      // Check if duplicate - try insert one by one
      for (const att of chunk) {
        try {
          const rawUserId = String(att.deviceUserId);
          const empCode = userIdToEmpCode(rawUserId, locCode);
          const recordTime = new Date(att.recordTime);
          const workDate = recordTime.toISOString().split('T')[0];
          const ip = att.ip || '';

          await pool.request()
            .input('machineCode', machineName)
            .input('rawUserId', rawUserId)
            .input('userSn', att.userSn || '')
            .input('scanTime', recordTime)
            .input('ip', ip)
            .input('empCode', empCode)
            .input('workDate', workDate)
            .input('batchId', null)
            .query(`
              INSERT INTO attendance_scan_logs (
                machine_code, raw_device_user_id, raw_user_sn,
                scan_time, raw_ip, parsed_employee_code, scan_date,
                mapping_status, sync_batch_id, created_at
              )
              VALUES (
                @machineCode, @rawUserId, @userSn,
                @scanTime, @ip, @empCode, @workDate,
                'MAPPED', @batchId, GETDATE()
              )
            `);
          inserted++;
        } catch (e2: any) {
          duplicates++;
        }
      }
    }

    if (Math.floor(i / chunkSize) % 5 === 0) {
      process.stdout.write(`.`);
    }
  }

  try {
    await pool.request()
      .input('batchCode', batchCode)
      .input('inserted', inserted)
      .query(`
        UPDATE attendance_import_batches
        SET status = CASE WHEN @inserted > 0 THEN 'COMPLETED' ELSE 'NO_DATA' END,
            records_success = @inserted,
            finished_at = GETDATE()
        WHERE batch_code = @batchCode
      `);
  } catch (e: any) {}

  console.log(`\n[${machineName}] ✓ Inserted ${inserted} records (${duplicates} skipped)`);
  return inserted;
}

async function main() {
  console.log('='.repeat(60));
  console.log('IMPORT ALL ATTENDANCE DATA - DIRECT CONNECTION');
  console.log('(Including all records, no skipping)');
  console.log('='.repeat(60));
  console.log(`Server: ${dbConfig.server}`);
  console.log(`Database: ${dbConfig.database}`);
  console.log('');

  console.log('Connecting to database...');
  const pool = await mssql.connect(dbConfig);
  console.log('✓ Connected!\n');

  const usersData = JSON.parse(fs.readFileSync('attendance-all-users.json', 'utf8'));
  const attData = JSON.parse(fs.readFileSync('attendance-all-logs.json', 'utf8'));

  console.log(`Total users to import: ${usersData.length}`);
  console.log(`Total attendances to import: ${attData.length}`);

  const usersByMachine: Record<string, any[]> = {};
  const attByMachine: Record<string, any[]> = {};

  for (const user of usersData) {
    const machine = user.machine;
    if (!usersByMachine[machine]) usersByMachine[machine] = [];
    usersByMachine[machine].push(user);
  }

  for (const att of attData) {
    const machine = att.machine;
    if (!attByMachine[machine]) attByMachine[machine] = [];
    attByMachine[machine].push(att);
  }

  console.log('\n--- IMPORTING USERS ---');
  let totalUsersImported = 0;
  for (const [machine, users] of Object.entries(usersByMachine)) {
    const imported = await importUsers(pool, machine, users);
    totalUsersImported += imported;
  }

  console.log('\n--- IMPORTING ATTENDANCES ---');
  let totalAttImported = 0;
  for (const [machine, atts] of Object.entries(attByMachine)) {
    const imported = await importAttendances(pool, machine, atts);
    totalAttImported += imported;
  }

  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total users imported: ${totalUsersImported}`);
  console.log(`Total attendances imported: ${totalAttImported}`);

  console.log('\n--- VERIFICATION ---');
  const empCount = await pool.request().query('SELECT COUNT(*) as cnt FROM employees');
  const attCount = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  const batchCount = await pool.request().query("SELECT COUNT(*) as cnt FROM attendance_import_batches WHERE source = 'DIRECT_ZKTECO'");

  console.log(`Total employees: ${empCount.recordset[0]?.cnt || 0}`);
  console.log(`Total attendance_scan_logs: ${attCount.recordset[0]?.cnt || 0}`);
  console.log(`Total import batches: ${batchCount.recordset[0]?.cnt || 0}`);

  console.log('\n--- Sample Employees (showing emp_code format) ---');
  const sample = await pool.request().query(`
    SELECT TOP 10 employee_code, employee_name, division_id
    FROM employees
    ORDER BY id DESC
  `);
  for (const emp of sample.recordset) {
    console.log(`  ${emp.employee_code}: ${emp.employee_name} (div: ${emp.division_id})`);
  }

  await pool.close();
  console.log('\n✓ Import complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Import failed:', error.message);
    process.exit(1);
  });
