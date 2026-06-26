import { config } from "./config.ts";
import { sqlClient } from "./sql-client.ts";
import { absensiApi } from "./absensi-client.ts";
import { absensiService } from "./absensi-service.ts";

/**
 * Script untuk import data dari API Absensi ke database
 * Aturan:
 * - Data dari mesin masuk ke absen_import (IMUTABLE)
 * - Data edit/manual masuk ke absen_machine_input (BISA DI-EDIT)
 */

interface SyncOptions {
  division?: string;
  year?: number;
  month?: number;
  mode?: "hk" | "ot";
}

/**
 * Parse attendance data dari API ke format yang sesuai untuk database
 */
function parseAttendanceData(
  apiData: any[],
  division: string,
  year: number,
  month: number
): Omit<import("./absensi-service.ts").AbsenRecord, "id" | "created_at">[] {
  const records: Omit<import("./absensi-service.ts").AbsenRecord, "id" | "created_at">[] = [];

  for (const row of apiData) {
    const empCode = row.empCode;
    const empName = row.empName;
    const gangCode = row.gangCode;

    // Parse each day (day_1 to day_31)
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = row[dayKey];

      if (!dayData) continue;

      // Skip if the day is not valid for this month
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) continue;

      records.push({
        emp_code: empCode,
        emp_name: empName,
        gang_code: gangCode || null,
        division: division,
        year: year,
        month: month,
        day: day,
        has_work: dayData.hasWork || false,
        is_sunday: dayData.isSunday || false,
        is_holiday: dayData.isHoliday || false,
        holiday_desc: dayData.holidayDesc || null,
        is_cuti: dayData.isCuti || false,
        is_sakit: dayData.isSakit || false,
        task_code: dayData.taskCode || null,
        ot_hours: parseFloat(dayData.otHours) || 0,
        attendance_date: date.toISOString().split("T")[0],
      });
    }
  }

  return records;
}

/**
 * Sync data untuk satu divisi
 */
async function syncDivision(
  division: string,
  year: number,
  month: number,
  mode: "hk" | "ot" = "hk"
): Promise<number> {
  console.log(`\n📥 Syncing: ${division} - ${month}/${year} (mode: ${mode})`);

  const startTime = Date.now();

  try {
    // Ambil data dari API
    const apiData = await absensiApi.getAttendance(division, month, year, mode);

    if (!apiData || apiData.length === 0) {
      console.log(`  ⚠️ No data from API for ${division}`);
      return 0;
    }

    // Parse ke format database
    const records = parseAttendanceData(apiData, division, year, month);
    console.log(`  📊 Parsed ${records.length} records`);

    // Insert ke absen_import (immutable - dari mesin)
    const inserted = await absensiService.insertImportBatch(
      records,
      division,
      year,
      month,
      "SYSTEM"
    );

    const duration = Date.now() - startTime;
    console.log(`  ✅ Imported ${inserted} records in ${duration}ms`);

    return inserted;
  } catch (error: any) {
    console.error(`  ❌ Sync failed:`, error.message);
    throw error;
  }
}

/**
 * Main sync function
 */
export async function runSync(options: SyncOptions = {}): Promise<void> {
  console.log("=".repeat(50));
  console.log("🚀 Starting Absensi Import");
  console.log("=".repeat(50));

  const startTime = Date.now();

  try {
    const divisions = options.division ? [options.division] : config.divisions;
    const mode = options.mode || "hk";

    // Default ke bulan terbaru jika tidak specify
    let targetYear = options.year;
    let targetMonth = options.month;

    if (!targetYear || !targetMonth) {
      // Ambil bulan terbaru dari divisi pertama
      const firstDivision = divisions[0];
      const months = await absensiApi.getAvailableMonths(firstDivision);
      if (months.length > 0) {
        targetYear = months[0].year;
        targetMonth = months[0].month;
      }
    }

    if (!targetYear || !targetMonth) {
      throw new Error("Cannot determine target year/month");
    }

    console.log(`\n📅 Target: ${targetYear}-${String(targetMonth).padStart(2, "0")}`);
    console.log(`📂 Divisions: ${divisions.join(", ")}`);

    let totalImported = 0;

    for (const division of divisions) {
      try {
        const count = await syncDivision(division, targetYear, targetMonth, mode);
        totalImported += count;
      } catch (error: any) {
        console.error(`❌ Error syncing ${division}:`, error.message);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log("\n" + "=".repeat(50));
    console.log(`✅ Import completed! Total: ${totalImported} records in ${totalTime}ms`);
    console.log("=".repeat(50));

    // Tampilkan statistik
    for (const division of divisions) {
      const stats = await absensiService.getStats(division, targetYear, targetMonth);
      console.log(`\n📊 ${division} Stats:`);
      console.log(`   - Import: ${stats.importCount}`);
      console.log(`   - Machine Input: ${stats.machineInputCount}`);
    }

  } catch (error: any) {
    console.error("\n❌ Import failed:", error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.main) {
  // Parse command line args
  const args = process.argv.slice(2);
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--division" && args[i + 1]) {
      options.division = args[i + 1];
    }
    if (args[i] === "--year" && args[i + 1]) {
      options.year = parseInt(args[i + 1]);
    }
    if (args[i] === "--month" && args[i + 1]) {
      options.month = parseInt(args[i + 1]);
    }
    if (args[i] === "--mode" && args[i + 1]) {
      options.mode = args[i + 1] as "hk" | "ot";
    }
  }

  runSync(options).catch(console.error);
}
