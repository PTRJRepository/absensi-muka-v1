import { query, closeDbPool } from '../lib/db';

async function check() {
  try {
    console.log('\n=== CHECKING TABLES ===');

    const tables = ['hr_employee_current_snapshot', 'employee_code_history', 'zkteco_absensi_user_registry'];
    for (const t of tables) {
      const r = await query(`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${t}'`);
      const exists = r.length > 0 && (r[0] as any).cnt > 0;
      console.log(`${exists ? '✓' : '✗'} ${t}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
    }

    console.log('\n=== employees columns (selected) ===');
    const emp = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' ORDER BY ORDINAL_POSITION`);
    emp.forEach((r: any) => console.log('  - ' + r.COLUMN_NAME));

    console.log('\n=== zkteco_absensi_user_registry columns ===');
    const reg = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'zkteco_absensi_user_registry' ORDER BY ORDINAL_POSITION`);
    reg.forEach((r: any) => console.log('  - ' + r.COLUMN_NAME));

    console.log('\n=== current_emp columns in attendance_scan_logs ===');
    const scan = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_scan_logs' AND COLUMN_NAME LIKE '%current%'`);
    scan.forEach((r: any) => console.log('  ✓ ' + r.COLUMN_NAME));
    if (scan.length === 0) console.log('  ✗ No current_emp columns');

    console.log('\n=== current_emp columns in attendance_imports ===');
    const imp = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_imports' AND COLUMN_NAME LIKE '%current%'`);
    imp.forEach((r: any) => console.log('  ✓ ' + r.COLUMN_NAME));
    if (imp.length === 0) console.log('  ✗ No current_emp columns');

    console.log('\n=== hr_employee_current_snapshot columns ===');
    const snap = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'hr_employee_current_snapshot' ORDER BY ORDINAL_POSITION`);
    snap.forEach((r: any) => console.log('  - ' + r.COLUMN_NAME));
    if (snap.length === 0) console.log('  ✗ Table does not exist');

  } finally {
    await closeDbPool();
  }
}

check().catch(console.error);
