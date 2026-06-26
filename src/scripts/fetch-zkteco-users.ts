import ZKLib from 'node-zklib';

async function fetchUsersFromMachine(ip: string, port: number, password: string, machineCode: string) {
  const zk = new ZKLib(ip, port, 10000, 4000, password);
  
  try {
    console.log(`\n=== Connecting to ${machineCode} (${ip}:${port}) ===`);
    await zk.createSocket();
    await zk.disableDevice();
    
    // Get users
    const users = await zk.getUsers();
    console.log(`Users from ${machineCode}:`);
    if (users.data && users.data.length > 0) {
      console.log(`  Total: ${users.data.length}`);
      // Show sample
      users.data.slice(0, 10).forEach((u: any) => {
        console.log(`    userId: ${u.userId}, name: ${u.name}, privilege: ${u.privilege}`);
      });
    } else {
      console.log('  No users found or error:', users.err);
    }
    
    await zk.enableDevice();
    await zk.disconnect();
    
    return users;
  } catch (err: any) {
    console.log(`  Error: ${err.message}`);
    return null;
  }
}

async function main() {
  // Try P1A machine (10.0.0.41)
  const result = await fetchUsersFromMachine('10.0.0.41', 4370, '12345', 'P1A');
  
  if (result?.data) {
    console.log('\n=== Full user list ===');
    result.data.forEach((u: any) => {
      console.log(`${u.userId}|${u.name}|${u.privilege}|${u.card||''}`);
    });
  }
}

main().catch(console.error);
