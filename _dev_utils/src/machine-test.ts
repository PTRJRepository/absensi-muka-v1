import { getMachineByDivision, getDivisionFromMachineId, convertMachineIdToEmpCode } from "./machine-config.ts";

/**
 * Connect using node-zklib with correct method names
 */
async function connectToMachine(division: string): Promise<any[]> {
  const ZKLib = require('node-zklib');

  const config = getMachineByDivision(division);

  console.log(`\n📡 Connecting to ${division} at ${config.ip}:${config.port}...`);

  return new Promise((resolve, reject) => {
    const zk = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: 10000,
      connectionTimeout: 4000
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      console.log(`  ⏱️ Timeout!`);
      try {
        zk.disconnect();
      } catch (e) {}
      resolve([]);
    }, 20000);

    // Use createSocket (not connect)
    zk.createSocket((err: any) => {
      clearTimeout(timeout);

      if (err) {
        console.log(`  ❌ Connection error: ${err.message}`);
        try {
          zk.disconnect();
        } catch (e) {}
        resolve([]);
        return;
      }

      console.log(`  ✅ Connected to ${division}!`);

      // Get users with callback
      zk.getUsers((err: any, users: any) => {
        if (err) {
          console.log(`  ⚠️ Get users error: ${err.message}`);
        } else if (users && users.data) {
          console.log(`  ✅ Got ${users.data.length} users`);

          console.log("\n  📋 Sample Users:");
          users.data.slice(0, 5).forEach((user: any) => {
            const machineId = user.userId || user.id;
            const detectedDivision = getDivisionFromMachineId(machineId) || division;
            const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);
            console.log(`    ID: ${machineId}, Name: ${user.name}, Division: ${detectedDivision}, EmpCode: ${empCode}`);
          });
        }

        // Get attendance with callback
        zk.getAttendances((err: any, attendance: any) => {
          // Always disconnect
          try {
            zk.disconnect();
          } catch (e) {}

          if (err) {
            console.log(`  ⚠️ Get attendance error: ${err.message}`);
            resolve([]);
            return;
          }

          if (attendance && attendance.data) {
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

            resolve(mappedData);
          } else {
            resolve([]);
          }
        });
      });
    });
  });
}

async function syncMachines() {
  console.log("=".repeat(50));
  console.log("🚀 Starting Machine Sync");
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
