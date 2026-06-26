import { query, closeDbPool } from '../lib/db';

async function check() {
  console.log('Checking attendance_imports...');
  const cols = await query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_imports' ORDER BY ORDINAL_POSITION");
  console.log('Found columns:', cols.length);
  cols.forEach((c: any) => console.log('  - ' + c.COLUMN_NAME));
  await closeDbPool();
}
check().catch(console.error);
