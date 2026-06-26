import ZKLib from "node-zklib";

/**
 * Connect to Attendance Machine using node-zklib
 *
 * Machine Info from documentation example:
 * - IP: 192.168.1.201 (need to verify)
 * - Port: 4370 (default for ZKTeco/Solution)
 */

interface MachineConfig {
  ip: string;
  port: number;
  timeout?: number;
}

/**
 * Get attendance data from machine
 */
export async function getAttendanceFromMachine(config: MachineConfig): Promise<any[]> {
  let zkInstance: ZKLib | null = null;

  try {
    console.log(`Connecting to machine at ${config.ip}:${config.port}...`);

    zkInstance = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: config.timeout || 10000,
      connectionTimeout: 4000
    });

    await zkInstance.createSocket();
    console.log("✅ Connected to machine!");

    // Get all attendance logs
    console.log("Fetching attendance data...");
    const attendance = await zkInstance.getAttendances();

    console.log(`✅ Got ${attendance.data.length} records`);

    // Map to simpler format
    const logs = attendance.data.map((item: any) => ({
      user_id: item.deviceUserId,
      employee_id: item.userId,
      timestamp: item.recordTime,
      event_type: item.eventType,
      verify_type: item.verifyType,
      work_code: item.workCode,
    }));

    return logs;

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
        console.log("Disconnected from machine");
      } catch (e) {
        // ignore disconnect errors
      }
    }
  }
}

/**
 * Get users from machine
 */
export async function getUsersFromMachine(config: MachineConfig): Promise<any[]> {
  let zkInstance: ZKLib | null = null;

  try {
    console.log(`Connecting to machine at ${config.ip}:${config.port}...`);

    zkInstance = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: config.timeout || 10000,
      connectionTimeout: 4000
    });

    await zkInstance.createSocket();
    console.log("✅ Connected!");

    // Get users
    console.log("Fetching users...");
    const users = await zkInstance.getUsers();

    console.log(`✅ Got ${users.data.length} users`);

    return users.data.map((user: any) => ({
      user_id: user.userId,
      employee_id: user.employeeId,
      name: user.name,
      privilege: user.privilege,
      enabled: user.enabled,
    }));

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
      } catch (e) {
        // ignore
      }
    }
  }
}

// Test connection if run directly
if (import.meta.main) {
  const config: MachineConfig = {
    ip: "192.168.1.201",  // Change this to your machine IP
    port: 4370,
    timeout: 10000
  };

  console.log("=".repeat(50));
  console.log("🧪 Testing Machine Connection");
  console.log("=".repeat(50));

  // Try to get users first
  try {
    const users = await getUsersFromMachine(config);
    console.log("\n📋 Users from machine:");
    console.log(JSON.stringify(users.slice(0, 5), null, 2));
  } catch (e) {
    console.log("\n⚠️ Could not get users, trying attendance...");
  }

  try {
    const attendance = await getAttendanceFromMachine(config);
    console.log("\n📋 Sample attendance data:");
    console.log(JSON.stringify(attendance.slice(0, 5), null, 2));
  } catch (e) {
    console.log("\n❌ Failed to get attendance:", e);
  }
}
