import ZKLib from 'node-zklib';

async function testZKTecoFull(ip, port, name) {
  console.log(`\n[TEST FULL] ${name} (${ip}:${port})`);
  console.log('='.repeat(60));

  let zk;
  try {
    zk = new ZKLib(ip, port, 30000, 4000, '12345');

    console.log('1. Creating socket...');
    await zk.createSocket();
    console.log('   ✓ Socket created');

    console.log('2. Getting device info...');
    const info = await zk.getInfo();
    console.log('   ✓ Info:', JSON.stringify(info));

    console.log('3. Disable device...');
    await zk.disableDevice();
    console.log('   ✓ Device disabled');

    console.log('4. Getting users...');
    const usersResult = await zk.getUsers();
    const users = usersResult?.data || [];
    console.log('   ✓ Users:', users.length);
    if (users.length > 0) {
      console.log('   Sample user:', JSON.stringify(users[0]));
    }

    console.log('5. Getting attendances...');
    const attResult = await zk.getAttendances();
    const att = attResult?.data || [];
    console.log('   ✓ Attendances:', att.length);
    if (att.length > 0) {
      console.log('   Sample att:', JSON.stringify(att[0]));
    }

    console.log('6. Enable device...');
    await zk.enableDevice();
    console.log('   ✓ Device enabled');

    await zk.disconnect();
    console.log('7. ✓ Disconnected');

    return { success: true, info, users: users.length, att: att.length, userSample: users[0], attSample: att[0] };
  } catch (error) {
    console.log('   ✗ Error:', error.message);
    if (zk) {
      try {
        await zk.enableDevice().catch(() => {});
        await zk.disconnect();
      } catch (e) {}
    }
    return { success: false, error: error.message };
  }
}

console.log('=== Full ZKTeco Test: P1A & P1B ===');

const p1a = await testZKTecoFull('10.0.0.90', 4100, 'P1A');
const p1b = await testZKTecoFull('10.0.0.91', 4300, 'P1B');

console.log('\n' + '='.repeat(60));
console.log('=== SUMMARY ===');
console.log('P1A:', p1a.success ? `SUCCESS (users=${p1a.users}, att=${p1a.att})` : 'FAILED - ' + p1a.error);
console.log('P1B:', p1b.success ? `SUCCESS (users=${p1b.users}, att=${p1b.att})` : 'FAILED - ' + p1b.error);

// Export sample data
console.log('\n=== SAMPLE DATA ===');
if (p1a.success && p1a.userSample) {
  console.log('P1A User Sample:', JSON.stringify(p1a.userSample, null, 2));
}
if (p1a.success && p1a.attSample) {
  console.log('P1A Att Sample:', JSON.stringify(p1a.attSample, null, 2));
}