import ZKLib from 'node-zklib';

async function fetchUsers(ip: string, port: number, password: string, machineCode: string) {
  const zk = new ZKLib(ip, port, 10000, 4000, password);

  try {
    console.log(`\n=== ${machineCode} (${ip}:${port}) ===`);
    await zk.createSocket();
    await zk.disableDevice();

    const users = await zk.getUsers();
    if (users.data && users.data.length > 0) {
      console.log(`Total users: ${users.data.length}`);
      users.data.slice(0, 15).forEach((u: any) => {
        console.log(`  ID: ${u.userId}, Name: ${u.name}, Priv: ${u.privilege}, Card: ${u.card || 'N/A'}`);
      });
    } else {
      console.log(`Error: ${users.err}`);
    }

    await zk.enableDevice();
    await zk.disconnect();
  } catch (err: any) {
    console.log(`  Error: ${err.message}`);
  }
}

async function main() {
  // Test with MILL machine
  await fetchUsers('103.127.66.32', 4370, '12345', 'MILL');

  // Test with OFFICE_APE
  await fetchUsers('103.144.208.154', 4370, '12345', 'OFFICE_APE');
}

main().catch(console.error);
