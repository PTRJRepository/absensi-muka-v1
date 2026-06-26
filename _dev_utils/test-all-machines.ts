import ZKLib from 'node-zklib';

interface MachineTestResult {
  name: string;
  ip: string;
  port: number;
  tcpOpen: boolean;
  pingReachable: boolean;
  zktecoConnected: boolean;
  deviceInfo: any;
  users: number;
  attendances: number;
  error: string;
  canAccess: boolean;
}

async function testMachine(ip: string, port: number, name: string): Promise<MachineTestResult> {
  const result: MachineTestResult = {
    name,
    ip,
    port,
    tcpOpen: false,
    pingReachable: false,
    zktecoConnected: false,
    deviceInfo: null,
    users: 0,
    attendances: 0,
    error: '',
    canAccess: false
  };

  let zk: any = null;

  try {
    // 1. Create socket and connect
    zk = new ZKLib(ip, port, 30000, 4000, '12345');
    await zk.createSocket();
    result.zktecoConnected = true;

    // 2. Get device info
    result.deviceInfo = await zk.getInfo();

    // 3. Disable device
    await zk.disableDevice();

    // 4. Get users
    const usersResult = await zk.getUsers();
    result.users = usersResult?.data?.length || 0;

    // 5. Get attendances
    const attResult = await zk.getAttendances();
    result.attendances = attResult?.data?.length || 0;

    // 6. Enable device
    await zk.enableDevice();

    // 7. Disconnect
    await zk.disconnect();

    result.canAccess = result.users > 0 || result.attendances > 0;

  } catch (error: any) {
    result.error = error.message;
    result.canAccess = false;
    if (zk) {
      try {
        await zk.enableDevice().catch(() => {});
        await zk.disconnect();
      } catch (e) {}
    }
  }

  return result;
}

// All 16 machines from user's list
const machines = [
  { name: 'OFFICE_PGE', ip: '223.25.98.220', port: 4370 },
  { name: 'DME_01', ip: '103.144.228.42', port: 4700 },
  { name: 'OFFICE_APE', ip: '103.144.208.154', port: 4370 },
  { name: 'Mill', ip: '103.127.66.32', port: 4370 },
  { name: 'IJL', ip: '103.144.211.226', port: 4370 },
  { name: 'ARC_01', ip: '103.144.208.154', port: 4200 },
  { name: 'DME_02', ip: '103.144.228.42', port: 4701 },
  { name: 'ARC_02', ip: '103.144.208.154', port: 4201 },
  { name: 'ARA', ip: '103.144.208.154', port: 4800 },
  { name: 'AB1', ip: '103.144.208.154', port: 4900 },
  { name: 'AB2', ip: '103.144.208.154', port: 4400 },
  { name: 'P1A', ip: '10.0.0.90', port: 4100 },
  { name: 'P1B', ip: '10.0.0.91', port: 4300 },
  { name: 'P2A_01', ip: '10.0.0.92', port: 4500 },
  { name: 'P2B', ip: '10.0.0.93', port: 4600 },
  { name: 'P2A_02', ip: '10.0.0.94', port: 4501 },
];

console.log('='.repeat(80));
console.log('TESTING ALL 16 ATTENDANCE MACHINES');
console.log('='.repeat(80));

const results: MachineTestResult[] = [];

for (const machine of machines) {
  console.log(`\n[${machine.name}] ${machine.ip}:${machine.port}`);
  console.log('-'.repeat(50));

  const result = await testMachine(machine.ip, machine.port, machine.name);
  results.push(result);

  if (result.canAccess) {
    console.log(`  ✓ ZKTeco: CONNECTED`);
    console.log(`  ✓ Users: ${result.users}`);
    console.log(`  ✓ Attendances: ${result.attendances}`);
    if (result.deviceInfo) {
      console.log(`  ✓ Device: ${JSON.stringify(result.deviceInfo)}`);
    }
  } else {
    console.log(`  ✗ Error: ${result.error || 'Failed to connect'}`);
  }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

const accessible = results.filter(r => r.canAccess);
const inaccessible = results.filter(r => !r.canAccess);

console.log(`\nTotal Machines: ${results.length}`);
console.log(`Accessible: ${accessible.length}`);
console.log(`Inaccessible: ${inaccessible.length}`);

console.log('\n--- ACCESSIBLE MACHINES ---');
for (const r of accessible) {
  console.log(`  ${r.name}: ${r.ip}:${r.port} (users=${r.users}, att=${r.attendances})`);
}

console.log('\n--- INACCESSIBLE MACHINES ---');
for (const r of inaccessible) {
  console.log(`  ${r.name}: ${r.ip}:${r.port} - ${r.error}`);
}

// Export results as JSON for config update
console.log('\n--- JSON CONFIG DATA ---');
const configData = results.map(r => ({
  name: r.name,
  ip: r.ip,
  port: r.port,
  canAccess: r.canAccess,
  users: r.users,
  attendances: r.attendances,
  error: r.error || null
}));
console.log(JSON.stringify(configData, null, 2));
