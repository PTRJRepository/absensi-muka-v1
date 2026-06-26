import ZKLib from 'node-zklib';
import fs from 'fs';

// Machine configurations from updated config
const accessibleMachines = [
  { name: 'OFFICE_PGE', ip: '223.25.98.220', port: 4370, suffix: 'PGE' },
  { name: 'MILL', ip: '103.127.66.32', port: 4370, suffix: 'MILL' },
  { name: 'OFFICE_APE', ip: '103.144.208.154', port: 4370, suffix: 'APE' },
  { name: 'IJL', ip: '103.144.211.226', port: 4370, suffix: 'IJL' },
  { name: 'AB2', ip: '103.144.208.154', port: 4400, suffix: 'AB2' },
  { name: 'P1A', ip: '10.0.0.90', port: 4100, suffix: 'P1A' },
  { name: 'P1B', ip: '10.0.0.91', port: 4300, suffix: 'P1B' },
];

interface ExportResult {
  machine: string;
  ip: string;
  port: number;
  success: boolean;
  users: any[];
  attendances: any[];
  error?: string;
}

async function exportMachine(ip: string, port: number, name: string): Promise<ExportResult> {
  const result: ExportResult = {
    machine: name,
    ip,
    port,
    success: false,
    users: [],
    attendances: [],
  };

  let zk: any = null;

  try {
    console.log(`\n[${name}] Connecting to ${ip}:${port}...`);

    zk = new ZKLib(ip, port, 30000, 4000, '12345');
    await zk.createSocket();
    console.log(`[${name}] ✓ Connected`);

    // Disable device
    await zk.disableDevice();
    console.log(`[${name}] ✓ Device disabled`);

    // Get users
    const usersResult = await zk.getUsers();
    result.users = usersResult?.data || [];
    console.log(`[${name}] ✓ Got ${result.users.length} users`);

    // Get attendances
    const attResult = await zk.getAttendances();
    result.attendances = attResult?.data || [];
    console.log(`[${name}] ✓ Got ${result.attendances.length} attendances`);

    // Enable device
    await zk.enableDevice();

    // Disconnect
    await zk.disconnect();

    result.success = true;
    console.log(`[${name}] ✓ Export complete`);

  } catch (error: any) {
    result.error = error.message;
    console.log(`[${name}] ✗ Error: ${error.message}`);
    if (zk) {
      try {
        await zk.enableDevice().catch(() => {});
        await zk.disconnect();
      } catch (e) {}
    }
  }

  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('EXPORT ATTENDANCE DATA FROM ALL ACCESSIBLE MACHINES');
  console.log('='.repeat(60));

  const results: ExportResult[] = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Export from each machine
  for (const machine of accessibleMachines) {
    const result = await exportMachine(machine.ip, machine.port, machine.name);
    results.push(result);

    // Save individual machine data
    if (result.success) {
      const filename = `attendance-${machine.name.toLowerCase()}-${timestamp}.json`;
      fs.writeFileSync(filename, JSON.stringify({
        machine: machine.name,
        ip: machine.ip,
        port: machine.port,
        exportedAt: new Date().toISOString(),
        users: result.users,
        attendances: result.attendances,
      }, null, 2));
      console.log(`[${machine.name}] ✓ Saved to ${filename}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('EXPORT SUMMARY');
  console.log('='.repeat(60));

  const totalUsers = results.reduce((sum, r) => sum + r.users.length, 0);
  const totalAtt = results.reduce((sum, r) => sum + r.attendances.length, 0);
  const successCount = results.filter(r => r.success).length;

  console.log(`\nMachines processed: ${results.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${results.length - successCount}`);
  console.log(`Total users exported: ${totalUsers}`);
  console.log(`Total attendances exported: ${totalAtt}`);

  console.log('\n--- DETAILS ---');
  for (const r of results) {
    const status = r.success ? '✓ SUCCESS' : '✗ FAILED';
    console.log(`${r.machine}: ${status} (users=${r.users.length}, att=${r.attendances.length})`);
    if (r.error) console.log(`  Error: ${r.error}`);
  }

  // Save combined export
  const combinedData = {
    exportedAt: new Date().toISOString(),
    totalMachines: results.length,
    successful: successCount,
    totalUsers,
    totalAttendances: totalAtt,
    machines: results.map(r => ({
      machine: r.machine,
      ip: r.ip,
      port: r.port,
      success: r.success,
      userCount: r.users.length,
      attendanceCount: r.attendances.length,
      error: r.error,
    })),
  };

  const summaryFilename = `attendance-export-summary-${timestamp}.json`;
  fs.writeFileSync(summaryFilename, JSON.stringify(combinedData, null, 2));
  console.log(`\n✓ Summary saved to ${summaryFilename}`);

  // Save raw data for database import
  const allUsers: any[] = [];
  const allAttendances: any[] = [];

  for (const r of results) {
    if (r.success) {
      allUsers.push(...r.users.map((u: any) => ({ ...u, machine: r.machine })));
      allAttendances.push(...r.attendances.map((a: any) => ({ ...a, machine: r.machine })));
    }
  }

  fs.writeFileSync('attendance-all-users.json', JSON.stringify(allUsers, null, 2));
  fs.writeFileSync('attendance-all-logs.json', JSON.stringify(allAttendances, null, 2));
  console.log(`✓ All users saved to attendance-all-users.json (${allUsers.length} records)`);
  console.log(`✓ All attendances saved to attendance-all-logs.json (${allAttendances.length} records)`);
}

main().catch(console.error);
