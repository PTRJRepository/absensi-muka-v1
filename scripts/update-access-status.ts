import { query, execute } from '../src/lib/db';
import { closeDbPool } from '../src/lib/db';

async function updateAccessStatus() {
  console.log('=== Step 1: Check current state ===\n');
  const currentState = await query<{ machine_code: string; access_status: string }>(
    'SELECT machine_code, access_status FROM attendance_machines ORDER BY machine_code'
  );
  console.table(currentState);

  console.log('\n=== Step 2: Set ACCESSIBLE for 7 machines ===\n');
  const accessibleResult = await execute(
    `UPDATE attendance_machines
     SET access_status = 'ACCESSIBLE'
     WHERE machine_code IN ('OFFICE_PGE', 'MILL', 'OFFICE_APE', 'IJL', 'AB2', 'P1A', 'P1B')`
  );
  console.log(`Rows affected: ${accessibleResult.rowsAffected[0]}`);

  console.log('\n=== Step 3: Set PORT_FORWARDING_NEEDED for 6 machines ===\n');
  const portBlockedResult = await execute(
    `UPDATE attendance_machines
     SET access_status = 'PORT_FORWARDING_NEEDED'
     WHERE machine_code IN ('DME_01', 'DME_02', 'ARC_01', 'ARC_02', 'ARA', 'AB1')`
  );
  console.log(`Rows affected: ${portBlockedResult.rowsAffected[0]}`);

  console.log('\n=== Step 4: Set NETWORK_UNREACHABLE for 3 machines ===\n');
  const networkResult = await execute(
    `UPDATE attendance_machines
     SET access_status = 'NETWORK_UNREACHABLE'
     WHERE machine_code IN ('P2A_01', 'P2B', 'P2A_02')`
  );
  console.log(`Rows affected: ${networkResult.rowsAffected[0]}`);

  console.log('\n=== Step 5: Verify the changes ===\n');
  const summary = await query<{ access_status: string; machine_count: number }>(
    `SELECT access_status, COUNT(*) as machine_count
     FROM attendance_machines
     GROUP BY access_status
     ORDER BY access_status`
  );
  console.log('\n=== Final summary by status ===\n');
  console.table(summary);

  console.log('\n=== Expected: ACCESSIBLE=7, NETWORK_UNREACHABLE=3, PORT_FORWARDING_NEEDED=6 ===\n');

  const updatedState = await query<{ machine_code: string; access_status: string }>(
    'SELECT machine_code, access_status FROM attendance_machines ORDER BY machine_code'
  );
  console.log('\n=== Final state ===\n');
  console.table(updatedState);

  await closeDbPool();
  console.log('\nDone!');
}

updateAccessStatus().catch((err) => {
  console.error('Error:', err);
  closeDbPool();
  process.exit(1);
});
