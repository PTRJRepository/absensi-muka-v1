import { getMachineByDivision, getDivisionFromMachineId, convertMachineIdToEmpCode } from "./machine-config.ts";

/**
 * Connect using node-zklib with await/promise
 */
async function connectToMachine(division: string): Promise<any[]> {
  const ZKLib = require('node-zklib');

  const config = getMachineByDivision(division);

  console.log(`\n📡 Connecting to ${division} at ${config.ip}:${config.port}...`);

  const zk = new ZKLib({
    ip: config.ip,
    port: config.port,
    inport: config.port,
    timeout: 15000,
    connectionTimeout: 5000
  });

  try {
    // Create socket and wait
    await zk.createSocket();
    console.log(`  ✅ Connected to ${division}!`);

    // Get users - try promise version
    console.log(`  📥 Fetching users...`);
    try {
      const users = await zk.getUsers();
      if (users && users.data) {
        console.log(`  ✅ Got ${users.data.length} users`);
        console.log("\n  📋 Sample Users:");
        users.data.slice(0, 3).forEach((user: any) => {
          const machineId = user.userId || user.id;
          const detectedDivision = getDivisionFromMachineId(machineId) || division;
          const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);
          console.log(`    ID: ${machineId}, Name: ${user.name}, EmpCode: ${empCode}`);
        });
      }
    } catch (e: any) {
      console.log(`  ⚠️ Users error: ${e.message}`);
    }

    // Get attendance
    console.log(`\n  📥 Fetching attendance...`);
    const attendance = await zk.getAttendances();

    console.log(`  ✅ Got ${attendance.data.length} attendance records`);

    console.log("\n  📋 Sample Attendance:");
    attendance.data.slice(0, 5).forEach((record: any) => {
      const machineId = record.deviceUserId || record.userId;
      const detectedDivision = getDivisionFromMachineId(machineId) || division;
      const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);
      console.log(`    EmpCode: ${empCode}, Time: ${record.recordTime}, Type: ${record.eventType}`);
    });

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
    try {
      await zk.disconnect();
      console.log(`  👋 Disconnected`);
    } catch (e) {}
  }
}

async function syncMachines() {
  console.log("=".repeat(50));
  console.log("🚀 Starting Machine Sync (await)");
  console.log("=".repeat(50));

  const divisions = ["PGE"];
  console.log(`\n📂 Testing with: ${divisions.join(", ")}`);

  const allData: any[] = [];

  for (const division of divisions) {
    const data = await connectToMachine(division);
    allData.push(...data);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Total records: ${allData.length}`);

  return allData;
}

if (import.meta.main) {
  syncMachines().catch(console.error);
}
