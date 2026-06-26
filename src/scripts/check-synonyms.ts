import { query, closeDbPool } from '../lib/db';
async function check() {
  console.log('Synonym base objects:');
  const syns = await query("SELECT name, base_object_name FROM sys.synonyms");
  syns.forEach((r: any) => console.log('  ' + r.name + ' -> ' + r.base_object_name));
  await closeDbPool();
}
check().catch(console.error);
