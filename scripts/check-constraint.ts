import { query } from '../src/lib/db';
import { closeDbPool } from '../src/lib/db';

async function checkConstraint() {
  const result = await query<any>(
    `SELECT definition
     FROM sys.check_constraints
     WHERE name = 'CK__attendanc__acces__7755B73D'`
  );
  console.log('CHECK constraint definition:');
  console.log(result);

  await closeDbPool();
}

checkConstraint().catch(console.error);
