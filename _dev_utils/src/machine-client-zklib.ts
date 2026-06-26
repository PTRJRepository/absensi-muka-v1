import { getMachineByDivision, getDivisionFromMachineId, convertMachineIdToEmpCode } from "./machine-config.ts";

/**
 * Connect to attendance machine using zklib
 */
async function connectToMachine(division: string): Promise<any[]> {
  const ZKLib = require('zklib');

  const config = getMachineByDivision(division);

  console.log(`\n📡 Connecting to ${division} at ${config.ip}:${config.port}...`);

  let zk: any = null;

  try {
    zk = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: 10000,
    });

    await zk.connect();
    console.log(`  ✅ Connected to ${division}!`);

    // Get users
    console.log(`  📥 Fetching users...`);
    const users = await zk.getUsers();
    console.log(`  ✅ Got ${users.data?.length || 0} users`);

    if (users.data && users.data.length > 0) {
      console.log("\n📋 Sample Users:");
      users.data.slice(0, 5).forEach((user: any) => {
        const machineId = user.userId || user.id;
        const detectedDivision = getDivisionFromMachineId(machineId) || division;
        const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);
        console.log(`  ID: ${machineId}, Name: ${user.name}, Division: ${detectedDivision}, EmpCode: ${empCode}`);
      });
    }

    // Get attendance
    console.log(`\n  📥 Fetching attendance...`);
    const attendance = await zk.getAttendances();
    console.log(`  ✅ Got ${attendance.data?.length || 0} attendance records`);

    if (attendance.data && attendance.data.length > 0) {
      console.log("\n📋 Sample Attendance:");
      attendance.data.slice(0, 5).forEach((record: any) => {
        const machineId = record.deviceUserId || record.userId;
        const detectedDivision = getDivisionFromMachineId(machineId) || division;
        const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);
        console.log(`  EmpCode: ${empCode}, Time: ${record.recordTime}, Type: ${record.eventType}`);
      });
    }

    // Map data
    const mappedData = (attendance.data || []).map((record: any) => {
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
        zk.disconnect();
        console.log(`  👋 Disconnected from ${division}`);
      } catch (e) {}
    }
  }
}

/**
 * Main sync function
 */
async function syncMachines() {
  console.log("=".repeat(50));
  console.log("🚀 Starting Machine Sync (zklib)");
  console.log("=".repeat(50));

  const divisions = ["PGE"]; // Test with PGE first
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

// Run if called directly
if (import.meta.main) {
  syncMachines().catch(console.error);
}
