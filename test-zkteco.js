require('dotenv').config({ path: '.env' });
const ZKLib = require('node-zklib');

const password = process.env.ZKTECO_PASSWORD || '0';

const machines = [
  { name: 'PGE',        ip: '223.25.98.220',   port: 4370 },
  { name: 'MILL',       ip: '103.127.66.32',    port: 4370 },
  { name: 'DME_01',     ip: '103.144.228.42',   port: 4700 },
  { name: 'DME_02',     ip: '103.144.228.42',   port: 4701 },
  { name: 'OFFICE_APE', ip: '103.144.208.154',  port: 4370 },
  { name: 'AB1',        ip: '103.144.208.154',  port: 4900 },
  { name: 'AB2',        ip: '103.144.208.154',  port: 4400 },
  { name: 'P1A',        ip: '10.0.0.90',        port: 4100 },
  { name: 'P1B',        ip: '10.0.0.91',        port: 4300 },
];

async function connectZkteco(ip, port) {
  return new Promise((resolve, reject) => {
    const zk = new ZKLib(ip, port, 5000, 4000, password);
    zk.createSocket(
      (err) => { if (err) reject(new Error(err)); },
      () => {}  // close callback
    );
    setTimeout(() => resolve(zk), 1000);
  });
}

async function testMachine(name, ip, port) {
  process.stdout.write(`Testing ${name} (${ip}:${port})... `);
  try {
    const zk = await connectZkteco(ip, port);
    const users = await zk.getUsers();
    const attendance = await zk.getAttendances();
    zk.disconnect();
    const userCount = Array.isArray(users) ? users.length : (users?.data?.length ?? 0);
    const attCount = Array.isArray(attendance) ? attendance.length : (attendance?.data?.length ?? 0);
    console.log(`✅ Users: ${userCount} | Attendance: ${attCount}`);
    if (attCount > 0) {
      const sample = Array.isArray(attendance) ? attendance[0] : attendance?.data?.[0];
      if (sample) console.log(`   Sample: uid=${sample.userId || sample.userSn} time=${sample.recordTime || sample.timestamp}`);
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
  }
}

async function main() {
  console.log('ZKTeco Connectivity Test\n');
  for (const m of machines) {
    await testMachine(m.name, m.ip, m.port);
    await new Promise(r => setTimeout(r, 500));
  }
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
