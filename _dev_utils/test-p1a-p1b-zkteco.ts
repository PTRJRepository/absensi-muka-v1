import ZKLib from 'node-zklib';

async function testZKTeco(ip, port, name) {
  console.log(`\n[TEST] ${name} (${ip}:${port})`);
  console.log('='.repeat(50));

  let zk;
  try {
    zk = new ZKLib(ip, port, 20000, 4000, '12345');
    console.log('  Creating socket...');
    await zk.createSocket();
    console.log('  ✓ Socket created');

    console.log('  Getting device info...');
    const info = await zk.getInfo();
    console.log('  ✓ Device info:', JSON.stringify(info));

    console.log('  Getting users...');
    const users = await zk.getUsers();
    console.log('  ✓ Users count:', users?.length || 0);

    console.log('  Getting attendances...');
    const att = await zk.getAttendances();
    console.log('  ✓ Attendances count:', att?.length || 0);

    await zk.disconnect();
    console.log('  ✓ Disconnected');

    return { success: true, users: users?.length || 0, att: att?.length || 0 };
  } catch (error) {
    console.log('  ✗ Error:', error.message);
    if (zk) await zk.disconnect().catch(() => {});
    return { success: false, error: error.message };
  }
}

console.log('=== Testing ZKTeco Connection to P1A & P1B ===');

// Test P1A
const p1a = await testZKTeco('10.0.0.90', 4100, 'P1A');

// Test P1B
const p1b = await testZKTeco('10.0.0.91', 4300, 'P1B');

console.log('\n=== SUMMARY ===');
console.log('P1A:', p1a.success ? 'SUCCESS' : 'FAILED - ' + p1a.error);
console.log('P1B:', p1b.success ? 'SUCCESS' : 'FAILED - ' + p1b.error);
