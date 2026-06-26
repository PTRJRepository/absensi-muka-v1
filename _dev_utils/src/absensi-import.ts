import { config } from "./config.ts";
import { absensiApi } from "./absensi-client.ts";

const API_KEY = config.sqlGateway.apiKey;
const BASE_URL = config.sqlGateway.baseUrl;
const SERVER = config.sqlGateway.server;
const DATABASE = config.sqlGateway.database;

/**
 * SQL Client dengan fetch langsung
 */
async function query(sql: string): Promise<any> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      sql,
      server: SERVER,
      db: DATABASE,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Query failed");
  }
  return result.data;
}

/**
 * Parse jam dari ISO string
 */
function parseJam(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  // Format: HH:MM:SS
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Konversi dari API format ke format database
 */
function convertApiToDbFormat(
  apiData: any[],
  division: string,
  year: number,
  month: number,
  batchId: string
): any[] {
  const records: any[] = [];

  for (const emp of apiData) {
    const empCode = emp.empCode;
    const empName = emp.empName;
    const gangCode = emp.gangCode;

    // Process each day
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = emp[dayKey];

      if (!dayData) continue;

      // Validate date - check if day is valid for the month
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) continue;

      // Format tanggal: YYYY-MM-DD
      const tanggal = date.toISOString().split("T")[0];

      // Jika ada kerja, buat record
      if (dayData.hasWork) {
        // Parse jam dari date string
        const jamMasuk = dayData.date ? parseJam(dayData.date) : null;

        records.push({
          emp_code: empCode,
          emp_name: empName,
          gang_code: gangCode,
          division: division,
          tahun: year,
          bulan: month,
          hari: day,
          tanggal: tanggal,
          jam_masuk: jamMasuk,
          jam_keluar: null, // API tidak menyediakan jam keluar
          record_type: 0, // masuk
          has_work: dayData.hasWork ? 1 : 0,
          is_sunday: dayData.isSunday ? 1 : 0,
          is_holiday: dayData.isHoliday ? 1 : 0,
          is_cuti: dayData.isCuti ? 1 : 0,
          is_sakit: dayData.isSakit ? 1 : 0,
          ot_hours: parseFloat(dayData.otHours) || 0,
          task_code: dayData.taskCode || null,
          attendance_date: dayData.date || null,
          import_batch_id: batchId,
          source: "API",
        });
      }
    }
  }

  return records;
}

/**
 * Import data dari API ke database
 */
async function importFromApi(
  division: string,
  year: number,
  month: number,
  importedBy: string = "SYSTEM"
): Promise<number> {
  console.log(`\n📥 Importing: ${division} - ${month}/${year}`);

  const batchId = `batch-${Date.now()}`;

  try {
    // Get data from API
    console.log("  📡 Fetching from API...");
    const apiData = await absensiApi.getAttendance(division, month, year, "hk");

    if (!apiData || apiData.length === 0) {
      console.log("  ⚠️ No data from API");
      return 0;
    }

    console.log(`  ✅ Got ${apiData.length} employees`);

    // Convert to DB format
    const records = convertApiToDbFormat(apiData, division, year, month, batchId);
    console.log(`  📊 Parsed ${records.length} records`);

    // Insert batch header
    await query(`
      INSERT INTO absen_import_batch (batch_id, division, year, month, total_records, status, imported_by)
      VALUES ('${batchId}', '${division}', ${year}, ${month}, ${records.length}, 'IN_PROGRESS', '${importedBy}')
    `);

    // Insert records with small delay
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      const sql = `
        INSERT INTO absen_import (
          emp_code, division, tanggal, jam_masuk, jam_keluar, record_type,
          has_work, is_sunday, is_holiday, is_cuti, is_sakit,
          ot_hours, task_code, attendance_date, import_batch_id, source
        ) VALUES (
          '${r.emp_code}',
          '${r.division}',
          '${r.tanggal}',
          ${r.jam_masuk ? `'${r.jam_masuk}'` : 'NULL'},
          ${r.jam_keluar ? `'${r.jam_keluar}'` : 'NULL'},
          ${r.record_type},
          ${r.has_work},
          ${r.is_sunday},
          ${r.is_holiday},
          ${r.is_cuti},
          ${r.is_sakit},
          ${r.ot_hours},
          ${r.task_code ? `'${r.task_code}'` : 'NULL'},
          ${r.attendance_date ? `'${r.attendance_date}'` : 'NULL'},
          '${r.import_batch_id}',
          '${r.source}'
        )
      `;

      try {
        await query(sql);
        inserted++;

        // Small delay every 20 records
        if (i > 0 && i % 20 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (e: any) {
        errors.push(`${r.emp_code} day ${r.hari}: ${e.message}`);
      }
    }

    // Update batch status
    await query(`
      UPDATE absen_import_batch
      SET status = '${errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED"}',
          imported_records = ${inserted},
          import_completed_at = GETDATE()
      WHERE batch_id = '${batchId}'
    `);

    console.log(`  ✅ Imported ${inserted}/${records.length} records`);
    return inserted;

  } catch (error: any) {
    console.error(`  ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Main import function
 */
async function runImport(options: {
  division?: string;
  year?: number;
  month?: number;
} = {}) {
  console.log("=".repeat(50));
  console.log("🚀 Starting Absensi Import");
  console.log("=".repeat(50));

  const divisions = options.division ? [options.division] : config.divisions;
  let year = options.year;
  let month = options.month;

  // Get latest month if not specified
  if (!year || !month) {
    const firstDivision = divisions[0];
    const months = await absensiApi.getAvailableMonths(firstDivision);
    if (months.length > 0) {
      year = months[0].year;
      month = months[0].month;
    }
  }

  if (!year || !month) {
    throw new Error("Cannot determine year/month");
  }

  console.log(`\n📅 Target: ${year}-${String(month).padStart(2, "0")}`);
  console.log(`📂 Divisions: ${divisions.join(", ")}\n`);

  let totalImported = 0;

  for (const division of divisions) {
    try {
      const count = await importFromApi(division, year, month);
      totalImported += count;
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Total imported: ${totalImported} records`);
  console.log("=".repeat(50));

  return totalImported;
}

// Export for use
export { runImport, importFromApi };

// Run if called directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--division" && args[i + 1]) options.division = args[i + 1];
    if (args[i] === "--year" && args[i + 1]) options.year = parseInt(args[i + 1]);
    if (args[i] === "--month" && args[i + 1]) options.month = parseInt(args[i + 1]);
  }

  runImport(options).catch(console.error);
}
