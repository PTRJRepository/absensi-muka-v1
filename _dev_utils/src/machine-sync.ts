import { machineServers, getMachineByDivision, getDivisionFromMachineId, convertMachineIdToEmpCode, getAllDivisions } from "./machine-config.ts";

/**
 * Connect to attendance machine and get data
 */
async function connectToMachine(division: string): Promise<any[]> {
  const ZKLib = require('node-zklib');

  const config = getMachineByDivision(division);
  let zk: any = null;

  console.log(`\n📡 Connecting to ${division} at ${config.ip}:${config.port}...`);

  try {
    zk = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: 10000,
      connectionTimeout: 4000
    });

    await zk.createSocket();
    console.log(`  ✅ Connected to ${division}!`);

    // Get users
    console.log(`  📥 Fetching users...`);
    const users = await zk.getUsers();
    console.log(`  ✅ Got ${users.data.length} users`);

    // Get attendance
    console.log(`  📥 Fetching attendance...`);
    const attendance = await zk.getAttendances();
    console.log(`  ✅ Got ${attendance.data.length} attendance records`);

    // Map data
    const mappedData = attendance.data.map((record: any) => {
      const machineId = record.deviceUserId || record.userId;
      const detectedDivision = getDivisionFromMachineId(machineId) || division;
      const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);

      return {
        machine_user_id: machineId,
        emp_code: empCode,
        division: detectedDivision,
        timestamp: record.recordTime,
        event_type: record.eventType,
        verify_type: record.verifyType,
        work_code: record.workCode,
      };
    });

    return mappedData;

  } catch (error: any) {
    console.log(`  ❌ Error: ${error.message}`);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
}

/**
 * Main sync function
 */
async function syncAllMachines() {
  console.log("=".repeat(50));
  console.log("🚀 Starting Machine Sync");
  console.log("=".repeat(50));

  const divisions = getAllDivisions();
  console.log(`\n📂 Divisions: ${divisions.join(", ")}`);

  const allData: any[] = [];

  for (const division of divisions) {
    const data = await connectToMachine(division);
    allData.push(...data);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Total records: ${allData.length}`);

  if (allData.length > 0) {
    console.log("\n📋 Sample Data:");
    console.log(JSON.stringify(allData.slice(0, 5), null, 2));
  }

  return allData;
}

// Run if called directly
if (import.meta.main) {
  syncAllMachines().catch(console.error);
}
