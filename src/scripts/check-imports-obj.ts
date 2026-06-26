import { query, closeDbPool } from '../lib/db';
async function check() {
  console.log('Checking object...');
  const obj = await query("SELECT type, type_desc FROM sys.objects WHERE name = 'attendance_imports'");
  obj.forEach((r: any) => console.log('type:', r.type, '-', r.type_desc));
  await closeDbPool();
}
check().catch(console.error);
