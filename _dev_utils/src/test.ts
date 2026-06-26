import { config } from "./config.ts";
import { sqlClient } from "./sql-client.ts";
import { absensiApi } from "./absensi-client.ts";
import { createTables, initConfig } from "./database.ts";
import { absensiService } from "./absensi-service.ts";

/**
 * Test script untuk memverifikasi koneksi dan melihat data
 */

console.log("🧪 Running connectivity tests...\n");

// Test 1: SQL Gateway Connection
async function testSqlGateway() {
  console.log("1️⃣  Testing SQL Gateway (SERVER_PROFILE_1)...");

  try {
    const result = await sqlClient.query("SELECT @@VERSION as version");
    const version = result?.recordset?.[0]?.version || "Unknown";
    console.log(`   ✅ Connected! Server: ${version.substring(0, 50)}...`);
    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 2: Database extend_db_ptrj
async function testDatabase() {
  console.log("\n2️⃣  Testing database: extend_db_ptrj...");

  try {
    const tables = await sqlClient.getTables();
    console.log(`   ✅ Database accessible! Tables: ${tables.length}`);
    if (tables.length > 0) {
      console.log(`   📋 Existing tables: ${tables.slice(0, 5).join(", ")}${tables.length > 5 ? "..." : ""}`);
    }
    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 3: Create Absensi Tables
async function testCreateTables() {
  console.log("\n3️⃣  Creating absensi tables...");

  try {
    await createTables();
    await initConfig();
    console.log(`   ✅ Tables created successfully!`);
    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 4: Absensi API - Divisions
async function testAbsensiDivisions() {
  console.log("\n4️⃣  Testing Absensi API - Divisions...");

  try {
    const divisions = await absensiApi.getDivisions();
    console.log(`   ✅ Connected! Divisions: ${divisions.join(", ")}`);
    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 5: Absensi API - Available Months
async function testAbsensiMonths() {
  console.log("\n5️⃣  Testing Absensi API - Available Months...");

  try {
    const months = await absensiApi.getAvailableMonths("PG1A");
    console.log(`   ✅ Available months for PG1A:`);
    months.forEach(m => {
      console.log(`      - ${m.year}-${String(m.month).padStart(2, "0")}`);
    });
    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 6: Absensi API - Attendance Data
async function testAbsensiAttendance() {
  console.log("\n6️⃣  Testing Absensi API - Attendance Data...");

  try {
    // Ambil bulan terbaru
    const months = await absensiApi.getAvailableMonths("PG1A");
    if (months.length === 0) {
      console.log("   ⚠️ No data available");
      return false;
    }

    const latest = months[0];
    const data = await absensiApi.getAttendance("PG1A", latest.month, latest.year, "hk");

    console.log(`   ✅ Attendance data for PG1A ${latest.year}-${latest.month}:`);
    console.log(`      Total employees: ${data.length}`);

    if (data.length > 0) {
      console.log(`      Sample: ${data[0].empName} (${data[0].empCode})`);
    }

    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Test 7: Test Service Layer
async function testServiceLayer() {
  console.log("\n7️⃣  Testing Absensi Service Layer...");

  try {
    // Test getDivisions
    const divisions = await absensiService.getDivisions();
    console.log(`   ✅ Service accessible! Divisions in DB: ${divisions.length > 0 ? divisions.join(", ") : "(empty)"}`);

    // Test getStats (will show 0 if no data)
    const stats = await absensiService.getStats("PG1A", 2025, 3);
    console.log(`   ✅ Stats: import=${stats.importCount}, machine=${stats.machineInputCount}`);

    return true;
  } catch (e: any) {
    console.error(`   ❌ Failed:`, e.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log("=".repeat(50));
  console.log("🧪 Connectivity Test Suite");
  console.log("=".repeat(50));

  const results = [];

  results.push(await testSqlGateway());
  results.push(await testDatabase());
  results.push(await testCreateTables());
  results.push(await testAbsensiDivisions());
  results.push(await testAbsensiMonths());
  results.push(await testAbsensiAttendance());
  results.push(await testServiceLayer());

  console.log("\n" + "=".repeat(50));
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`📊 Results: ${passed}/${total} tests passed`);
  console.log("=".repeat(50));

  if (passed === total) {
    console.log("\n✅ All tests passed! Ready to sync.");
  } else {
    console.log("\n⚠️  Some tests failed. Please check configuration.");
  }
}

runTests().catch(console.error);
