import { query, closeDbPool } from '../lib/db';

async function check() {
  console.log('All user tables:');
  const tables = await query("SELECT name FROM sys.tables WHERE type = 'U' ORDER BY name");
  tables.forEach((t: any) => console.log('  ' + t.name));
  await closeDbPool();
}
check().catch(console.error);
