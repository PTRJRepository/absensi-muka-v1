import mssql from 'mssql';
import ZKLib from 'node-zklib';
import { performance } from 'perf_hooks';

const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

const scannerPrefixLocMap: Record<string, string> = {
  '001': 'L',
  '100': 'A',
  '200': 'J',
  '300': 'B',
  '400': 'H',
  '500': 'C',
  '600': 'D',
  '700': 'E',
  '800': 'F',
  '900': 'G',
};

// Parse ZKTeco userId to HR employee code
// Format: 3-digit scanner prefix + employee suffix; raw ID must be long (>5)
// Examples:
//   1000890 -> A0890
//   5000669 -> C0669
//   0010015 -> L0015
function parseZKTecoUserId(userId: string): string | null {
  if (!/^\d+$/.test(userId) || userId.length <= 5) return null;
  const locCode = scannerPrefixLocMap[userId.slice(0, 3)];
  if (!locCode) return null;
  return `${locCode}${userId.slice(-4)}`;
}

function mappingReasonForUserId(userId: string): string {
  if (!userId) return 'EMPTY_RAW_DEVICE_USER_ID';
  if (/^\d+$/.test(userId) && userId.length <= 5) return 'RAW_ID_TOO_SHORT_EXCLUDED';
  if (/^\d+$/.test(userId) && userId.length > 5) {
    return scannerPrefixLocMap[userId.slice(0, 3)]
      ? 'PARSED_LONG_RAW_SCANNER_PREFIX_EMPLOYEE_NOT_FOUND'
      : 'LONG_RAW_ID_LOOKUP_REQUIRED';
  }
  return 'UNSUPPORTED_RAW_ID_FORMAT';
}

interface ZKUser {
  userId: string;
  name: string;
  privilege: number;
  card?: string;
}

interface MachineInfo {
  machine_code: string;
  ip_address: string;
  port: number;
  loc_code: string;
}

async function fetchZKTecoUsers(machine: MachineInfo): Promise<ZKUser[]> {
  const zk = new ZKLib(machine.ip_address, machine.port, 10000, 4000, '12345');
  const users: ZKUser[] = [];

  try {
    await zk.createSocket();
    await zk.disableDevice();
    const result = await zk.getUsers();
    if (result.data) {
      result.data.forEach((u: any) => {
        users.push({
          userId: String(u.userId),
          name: u.name || '',
          privilege: u.privilege,
          card: u.card || '',
        });
      });
    }
    await zk.enableDevice();
    await zk.disconnect();
  } catch (err: any) {
    console.log(`  [${machine.machine_code}] Error: ${err.message}`);
  }

  return users;
}

async function syncZKTecoToHR() {
  const pool = await mssql.connect(absensiDb);

  console.log('=== ZKTeco to HR Employee Mapping Sync ===\n');
  console.log('Logic: only long raw IDs (>5 chars) with scanner prefix are converted; short IDs are excluded.\n');

  // Get all accessible machines
  const machines = await pool.request().query(`
    SELECT machine_code, ip_address, port, loc_code
    FROM attendance_machines
    WHERE is_active = 1
    AND access_status = 'ACCESSIBLE'
    AND data_source = 'DIRECT_ZKTECO'
  `);

  console.log(`Found ${machines.recordset.length} accessible ZKTeco machines\n`);

  let totalUsers = 0;
  let matched = 0;
  let unmatched = 0;

  // Process each machine
  for (const machine of machines.recordset) {
    console.log(`\n=== Processing ${machine.machine_code} ===`);

    const startTime = performance.now();
    const zkUsers = await fetchZKTecoUsers(machine);
    const duration = Math.round(performance.now() - startTime);

    console.log(`  Fetched ${zkUsers.length} users in ${duration}ms`);

    if (zkUsers.length === 0) continue;

    totalUsers += zkUsers.length;

    // Process each user
    for (const user of zkUsers) {
      const parsedCode = parseZKTecoUserId(user.userId);

      // Check if parsed code exists in employees table
      let hrCode: string | null = null;
      if (parsedCode) {
        const result = await pool.request().query(`
          SELECT employee_code FROM employees WHERE employee_code = '${parsedCode}' AND is_active = 1
        `);
        if (result.recordset.length > 0) {
          hrCode = result.recordset[0].employee_code;
        }
      }

      if (hrCode) {
        matched++;
      } else {
        unmatched++;
        if (unmatched <= 10) {
          console.log(`  UNMATCHED: ${user.userId} -> "${user.name}" (parsed: ${parsedCode || 'INVALID'})`);
        }
      }

      // Upsert mapping
      const confidence = hrCode ? 'CONVERTED_LONG_RAW_ID' : 'UNMATCHED';
      const matchMethod = hrCode ? 'PARSED_LONG_RAW_SCANNER_PREFIX_HR_VERIFIED' : mappingReasonForUserId(user.userId);
      await pool.request().query(`
        IF EXISTS (SELECT 1 FROM zkteco_hr_employee_map WHERE machine_code = '${machine.machine_code}' AND zkteco_user_id = '${user.userId}')
        BEGIN
          UPDATE zkteco_hr_employee_map SET
            zkteco_user_name = '${user.name.replace(/'/g, "''")}',
            hr_employee_code = ${hrCode ? `'${hrCode}'` : 'NULL'},
            hr_employee_name = CASE WHEN ${hrCode ? '1' : '0'} = 1 THEN (SELECT employee_name FROM employees WHERE employee_code = '${hrCode}') ELSE '${user.name.replace(/'/g, "''")}' END,
            match_confidence = '${confidence}',
            match_method = '${matchMethod}',
            updated_at = SYSUTCDATETIME()
          WHERE machine_code = '${machine.machine_code}' AND zkteco_user_id = '${user.userId}'
        END
        ELSE
        BEGIN
          INSERT INTO zkteco_hr_employee_map (machine_code, zkteco_user_id, zkteco_user_name, hr_employee_code, hr_employee_name, match_confidence, match_method)
          VALUES (
            '${machine.machine_code}',
            '${user.userId}',
            '${user.name.replace(/'/g, "''")}',
            ${hrCode ? `'${hrCode}'` : 'NULL'},
            ${hrCode ? `(SELECT employee_name FROM employees WHERE employee_code = '${hrCode}')` : `'${user.name.replace(/'/g, "''")}'`},
            '${confidence}',
            '${matchMethod}'
          )
        END
      `);
    }

    console.log(`  Saved ${zkUsers.length} mappings`);
  }

  console.log('\n=== Summary ===');
  console.log(`  Total ZKTeco users: ${totalUsers}`);
  console.log(`  Matched to HR: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);

  // Show matched sample
  console.log('\n=== Sample Matches ===');
  const samples = await pool.request().query(`
    SELECT TOP 15 zkteco_user_id, zkteco_user_name, hr_employee_code, hr_employee_name
    FROM zkteco_hr_employee_map
    WHERE hr_employee_code IS NOT NULL
    ORDER BY updated_at DESC
  `);
  samples.recordset.forEach((s: any) => {
    console.log(`  ${s.zkteco_user_id} -> ${s.hr_employee_code} "${s.hr_employee_name}"`);
  });

  // Show unmatched sample
  console.log('\n=== Sample Unmatched ===');
  const unmatchedSamples = await pool.request().query(`
    SELECT TOP 10 zkteco_user_id, zkteco_user_name
    FROM zkteco_hr_employee_map
    WHERE hr_employee_code IS NULL
    ORDER BY updated_at DESC
  `);
  unmatchedSamples.recordset.forEach((s: any) => {
    console.log(`  ${s.zkteco_user_id} "${s.zkteco_user_name}" -> NOT FOUND`);
  });

  await pool.close();
}

syncZKTecoToHR().catch(console.error);
